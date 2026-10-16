import json
import logging
import time
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from typing import Any, Callable, Iterator, Optional
from uuid import UUID

import jwt
import logfire
from flask import current_app

from Api.database import db
from Api.redis import live_redis
from Models.trip import Trip, TripStateType
from Models.trip_member import TripMember
from Services.live_position_service import LivePositionService, live_channel
from Services.Utils.pubsub_fanout import PubSubFanout, SubscriptionClosed

logger = logging.getLogger(__name__)

STREAM_TICKET_PURPOSE = "live-stream"
CHANGES_TICKET_PURPOSE = "trip-changes"
STREAM_TICKET_TTL_MINUTES = 5

# A poll asks "is this person still on the trip?" every few seconds. Asking the database each
# time would make the poll as expensive as the page it is checking on, so a confirmed member
# is remembered briefly. Only a yes is remembered: someone just invited must not wait out the
# window to be let in. The cost is that a removed member's polls keep being answered — with
# identities, never field values — for up to this long.
MEMBERSHIP_CACHE_SECONDS = 30
_MEMBERSHIP_CACHE_MAX_ENTRIES = 4096
_confirmed_members: dict[tuple[str, str], float] = {}


@lru_cache(maxsize=1)
def live_fanout() -> PubSubFanout:
    """The process's single Redis subscription for position streams. One per process because
    each gunicorn worker is its own process with its own connection to share: a viewer used to
    take a pooled connection of its own, and `live_redis()`'s pool is capped at 100."""
    return PubSubFanout(live_redis)


class LiveStreamService:
    """SSE generator + stream-ticket minting for the M8 sidecar (§D4/§D5)."""

    @staticmethod
    def mint_stream_ticket(trip_id: str) -> str:
        return LiveStreamService._mint_ticket(STREAM_TICKET_PURPOSE, trip_id)

    @staticmethod
    def verify_stream_ticket(token: str, trip_id: str) -> bool:
        return LiveStreamService._decode_ticket(token, STREAM_TICKET_PURPOSE, trip_id) is not None

    @staticmethod
    def mint_changes_ticket(trip_id: str, user_id: str) -> str:
        """Unlike a position-stream ticket this names the user: the poll has no other way to
        know whose membership to check, and to key its rate limit on."""
        return LiveStreamService._mint_ticket(CHANGES_TICKET_PURPOSE, trip_id, userId=user_id)

    @staticmethod
    def verify_changes_ticket(token: str, trip_id: str) -> Optional[str]:
        """The ticket's user id, or None when it is invalid, expired, for another trip, or
        minted for another stream."""
        payload = LiveStreamService._decode_ticket(token, CHANGES_TICKET_PURPOSE, trip_id)
        return None if payload is None else payload.get("userId")

    @staticmethod
    def _mint_ticket(purpose: str, trip_id: str, **extra_claims: str) -> str:
        secret_key = current_app.config["JWT_SECRET_KEY"]
        payload = {
            "purpose": purpose,
            "tripId": trip_id,
            "iat": datetime.now(timezone.utc),
            "exp": datetime.now(timezone.utc) + timedelta(minutes=STREAM_TICKET_TTL_MINUTES),
            **extra_claims,
        }
        return jwt.encode(payload, secret_key, algorithm="HS256")

    @staticmethod
    def _decode_ticket(token: str, purpose: str, trip_id: str) -> Optional[dict[str, Any]]:
        secret_key = current_app.config["JWT_SECRET_KEY"]
        try:
            payload = jwt.decode(token, secret_key, algorithms=["HS256"])
        except jwt.InvalidTokenError:
            return None
        if payload.get("purpose") != purpose or payload.get("tripId") != trip_id:
            return None
        return payload

    @staticmethod
    def is_trip_member_cached(
        trip_id: str, user_id: str, *, monotonic: Callable[[], float] = time.monotonic
    ) -> bool:
        """Whether `user_id` is on the trip, remembered for `MEMBERSHIP_CACHE_SECONDS` once
        confirmed. For the change poll, which asks every few seconds per open page."""
        key = (user_id, trip_id)
        now = monotonic()
        expires_at = _confirmed_members.get(key)
        if expires_at is not None and expires_at > now:
            return True

        is_member = LiveStreamService._is_trip_member(trip_id, user_id)
        if not is_member:
            _confirmed_members.pop(key, None)
            return False
        if len(_confirmed_members) >= _MEMBERSHIP_CACHE_MAX_ENTRIES:
            for stale_key in [k for k, expiry in _confirmed_members.items() if expiry <= now]:
                del _confirmed_members[stale_key]
            if len(_confirmed_members) >= _MEMBERSHIP_CACHE_MAX_ENTRIES:
                _confirmed_members.clear()
        _confirmed_members[key] = now + MEMBERSHIP_CACHE_SECONDS
        return True

    @staticmethod
    def _is_trip_member(trip_id: str, user_id: str) -> bool:
        try:
            trip_uuid, user_uuid = UUID(trip_id), UUID(user_id)
        except ValueError:
            return False
        with logfire.suppress_instrumentation():
            membership = (
                db.session.query(TripMember.id)
                .filter(TripMember.trip_id == trip_uuid, TripMember.user_id == user_uuid)
                .first()
            )
        return membership is not None

    @staticmethod
    def stream_events(
        trip_id: str,
        *,
        pubsub: Optional[Any] = None,
        fanout: Optional[Any] = None,
        heartbeat_seconds: int = 15,
        max_ticks: Optional[int] = None,
    ) -> Iterator[str]:
        """Stateless snapshot-then-stream generator.

        `pubsub`/`fanout`/`max_ticks` are injectable so tests can drive this directly with a
        scripted fake — Flask's test client buffers full responses and cannot consume
        an infinite stream. Do not remove that seam.

        The subscription comes from the process-wide fan-out, not a `pubsub()` of its own, so
        however many people watch — a crew, plus anyone with the public story link — the
        process holds one Redis connection for them all. A viewer the fan-out cuts loose for
        not reading ends the stream *without* an `end` event: `end` tells the client not to
        come back, and this one should, to take a fresh snapshot.

        The whole connection lifetime is one manual Logfire span, not the default
        per-request auto-instrumented span: the route is excluded from Flask
        auto-instrumentation (Api/observability.py _EXCLUDED_URL_PATTERNS) so this is the
        only top-level span a connection produces, and the per-tick liveness query
        underneath is suppressed (see the loop), so a connection costs one record however
        many hours it stays open.
        """
        tick_count = 0
        position_events = 0
        with logfire.span("sse_connection", trip_id=trip_id) as span:
            yield "retry: 5000\n\n"

            snapshot = [
                LivePositionService.to_broadcast_dict(p)
                for p in LivePositionService.latest_positions(trip_id)
            ]
            yield f"event: snapshot\ndata: {json.dumps(snapshot)}\n\n"

            owns_pubsub = pubsub is None
            if owns_pubsub:
                shared_fanout = fanout if fanout is not None else live_fanout()
                pubsub = shared_fanout.subscribe(live_channel(trip_id))
            assert pubsub is not None

            try:
                tick = 0
                while max_ticks is None or tick < max_ticks:
                    # Suppressed because this liveness re-query is the app's largest span
                    # producer: one identical `SELECT trips` per tick per open connection for
                    # the connection's whole lifetime, and a tick is not only the 15s
                    # heartbeat — the loop also turns on every relayed position. A day-long
                    # Navigate session emits thousands, none saying anything the connection
                    # span's tick_count doesn't. Excluding the route from Flask
                    # auto-instrumentation (Api/observability.py) only re-parents these under
                    # sse_connection; it does not stop them being emitted. A failure here
                    # still shows up: it propagates out of the generator and is recorded on
                    # the enclosing sse_connection span.
                    with logfire.suppress_instrumentation():
                        trip = db.session.query(Trip).filter_by(id=UUID(trip_id)).first()
                        state = trip.state if trip else None
                        # An SSE client must never pin a pool connection across ticks —
                        # this is a long-lived generator; without releasing it here, the
                        # connection pool exhausts at ~5 concurrent viewers.
                        db.session.remove()

                    if state != TripStateType.HAPPENING:
                        yield "event: end\ndata: {}\n\n"
                        return

                    tick += 1
                    tick_count = tick
                    try:
                        message = pubsub.get_message(timeout=heartbeat_seconds)
                    except SubscriptionClosed:
                        return
                    if message is not None and message.get("type") == "message":
                        position_events += 1
                        yield f"event: position\ndata: {message['data']}\n\n"
                    else:
                        yield ": hb\n\n"
            finally:
                span.set_attribute("tick_count", tick_count)
                span.set_attribute("position_events", position_events)
                if owns_pubsub:
                    pubsub.close()
