import json
import logging
import time
from datetime import datetime, timedelta, timezone
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
from Services.trip_change_service import trip_changes_channel, trip_revision_key

logger = logging.getLogger(__name__)

STREAM_TICKET_PURPOSE = "live-stream"
CHANGES_TICKET_PURPOSE = "trip-changes"
STREAM_TICKET_TTL_MINUTES = 5


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
        """Unlike a position-stream ticket this names the user: the changes stream
        outlives a ticket's 5 minutes and must re-check that user's membership."""
        return LiveStreamService._mint_ticket(CHANGES_TICKET_PURPOSE, trip_id, user_id=user_id)

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
    def stream_trip_changes(
        trip_id: str,
        user_id: str,
        *,
        pubsub: Optional[Any] = None,
        redis_client: Optional[Any] = None,
        heartbeat_seconds: int = 15,
        membership_check_seconds: int = 60,
        max_ticks: Optional[int] = None,
        monotonic: Callable[[], float] = time.monotonic,
    ) -> Iterator[str]:
        """Trip change notifications for one crew member (M36 §WP2).

        Sends no data snapshot: `hello` carries only the trip's current revision, and a
        client whose last-seen revision differs refetches what it is showing — the same
        path serves a reconnect and a flushed Redis. Subscribes *before* reading the
        revision so a change landing in between is delivered rather than lost.

        Unlike `stream_events` this does not end when the trip leaves `happening`
        (collaboration is mostly before and after), and it re-checks membership on a slow
        timer so a removed crew member's open stream closes. `pubsub`, `redis_client`,
        `max_ticks` and `monotonic` are injectable for the same reason as in
        `stream_events`: Flask's test client cannot consume an infinite stream.
        """
        tick_count = 0
        change_events = 0
        with logfire.span("sse_connection", trip_id=trip_id, stream="trip_changes") as span:
            yield "retry: 5000\n\n"

            owns_pubsub = pubsub is None
            client = redis_client if redis_client is not None else live_redis()
            if owns_pubsub:
                pubsub = client.pubsub()
                pubsub.subscribe(trip_changes_channel(trip_id))
            assert pubsub is not None

            try:
                revision = int(client.get(trip_revision_key(trip_id)) or 0)
                yield f"event: hello\ndata: {json.dumps({'rev': revision})}\n\n"

                last_membership_check = monotonic()
                tick = 0
                while max_ticks is None or tick < max_ticks:
                    if monotonic() - last_membership_check >= membership_check_seconds:
                        last_membership_check = monotonic()
                        if not LiveStreamService._is_trip_member(trip_id, user_id):
                            yield "event: end\ndata: {}\n\n"
                            return

                    tick += 1
                    tick_count = tick
                    message = pubsub.get_message(timeout=heartbeat_seconds)
                    if message is not None and message.get("type") == "message":
                        change_events += 1
                        yield f"event: change\ndata: {message['data']}\n\n"
                    else:
                        yield ": hb\n\n"
            finally:
                span.set_attribute("tick_count", tick_count)
                span.set_attribute("change_events", change_events)
                if owns_pubsub:
                    pubsub.unsubscribe(trip_changes_channel(trip_id))
                    pubsub.close()

    @staticmethod
    def _is_trip_member(trip_id: str, user_id: str) -> bool:
        with logfire.suppress_instrumentation():
            membership = (
                db.session.query(TripMember.id)
                .filter(TripMember.trip_id == UUID(trip_id), TripMember.user_id == UUID(user_id))
                .first()
            )
            # Released on every check: a long-lived generator must not pin a pool
            # connection between checks (see `stream_events`).
            db.session.remove()
        return membership is not None

    @staticmethod
    def stream_events(
        trip_id: str,
        *,
        pubsub: Optional[Any] = None,
        heartbeat_seconds: int = 15,
        max_ticks: Optional[int] = None,
    ) -> Iterator[str]:
        """Stateless snapshot-then-stream generator (§D4).

        `pubsub`/`max_ticks` are injectable so tests can drive this directly with a
        scripted fake — Flask's test client buffers full responses and cannot consume
        an infinite stream. Do not remove that seam.

        The whole connection lifetime is one manual Logfire span (M13 §A.2), not the
        default per-request auto-instrumented span — the route is excluded from Flask
        auto-instrumentation (Api/observability.py _EXCLUDED_URL_PATTERNS) precisely so
        this is the only top-level span a connection produces. It is also the *only*
        span a connection produces: the per-tick liveness query underneath is
        explicitly suppressed (see the loop), so a connection costs one record no
        matter how many hours it stays open.
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
                pubsub = live_redis().pubsub()
                pubsub.subscribe(live_channel(trip_id))
            assert pubsub is not None

            try:
                tick = 0
                while max_ticks is None or tick < max_ticks:
                    # Suppressed, because this liveness re-query is the single largest
                    # span producer in the app: one identical `SELECT trips` per tick,
                    # per open connection, for the connection's whole lifetime — and a
                    # tick is *not* only the 15s heartbeat, the loop also turns on every
                    # relayed position. A day-long Navigate session emits thousands of
                    # them and none says anything the connection span's tick_count
                    # doesn't. Excluding the route from Flask auto-instrumentation
                    # (Api/observability.py) only re-parented these under sse_connection;
                    # it never stopped them being emitted, so the M13 §A.0.4 cost
                    # guardrail was only ever half-applied. A failure here still shows
                    # up — it propagates out of the generator and is recorded on the
                    # enclosing sse_connection span.
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
                    message = pubsub.get_message(timeout=heartbeat_seconds)
                    if message is not None and message.get("type") == "message":
                        position_events += 1
                        yield f"event: position\ndata: {message['data']}\n\n"
                    else:
                        yield ": hb\n\n"
            finally:
                span.set_attribute("tick_count", tick_count)
                span.set_attribute("position_events", position_events)
                if owns_pubsub:
                    pubsub.unsubscribe(live_channel(trip_id))
                    pubsub.close()
