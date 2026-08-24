import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Iterator, Optional
from uuid import UUID

import jwt
import logfire
from flask import current_app

from Api.database import db
from Api.redis import live_redis
from Models.trip import Trip, TripStateType
from Services.live_position_service import LivePositionService, live_channel

logger = logging.getLogger(__name__)

STREAM_TICKET_PURPOSE = "live-stream"
STREAM_TICKET_TTL_MINUTES = 5


class LiveStreamService:
    """SSE generator + stream-ticket minting for the M8 sidecar (§D4/§D5)."""

    @staticmethod
    def mint_stream_ticket(trip_id: str) -> str:
        secret_key = current_app.config["JWT_SECRET_KEY"]
        payload = {
            "purpose": STREAM_TICKET_PURPOSE,
            "tripId": trip_id,
            "iat": datetime.now(timezone.utc),
            "exp": datetime.now(timezone.utc) + timedelta(minutes=STREAM_TICKET_TTL_MINUTES),
        }
        return jwt.encode(payload, secret_key, algorithm="HS256")

    @staticmethod
    def verify_stream_ticket(token: str, trip_id: str) -> bool:
        secret_key = current_app.config["JWT_SECRET_KEY"]
        try:
            payload = jwt.decode(token, secret_key, algorithms=["HS256"])
        except jwt.InvalidTokenError:
            return False
        return payload.get("purpose") == STREAM_TICKET_PURPOSE and payload.get("tripId") == trip_id

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
