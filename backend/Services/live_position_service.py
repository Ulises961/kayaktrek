import json
import logging
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from Api.database import db
from Api.redis import live_redis
from Models.position_ping import PositionPing
from Models.trip import Trip, TripStateType
from Models.user import User

logger = logging.getLogger(__name__)


def live_channel(trip_id: str) -> str:
    return f"live:trip:{trip_id}"


class LivePositionService:
    """Live crew position ingest + broadcast (M8 §D2/§D3)."""

    @staticmethod
    def record_ping(trip_id: str, user_id: str, data: dict[str, Any]) -> PositionPing:
        """Persist a GPS ping and publish it to the trip's live channel.

        Raises ValueError("trip_not_live") unless the trip is `happening`. Accepted
        while `is_paused` — a paused crew relocating to shelter is exactly when shore
        wants positions.
        """
        trip = db.session.query(Trip).filter_by(id=UUID(trip_id)).first()
        if trip is None or trip.state != TripStateType.HAPPENING:
            raise ValueError("trip_not_live")

        recorded_at = data.get("recorded_at")
        now = datetime.now(timezone.utc)
        if recorded_at is None or recorded_at > now:
            recorded_at = now

        ping = PositionPing(
            trip_id=UUID(trip_id),
            user_id=UUID(user_id),
            lat=data["lat"],
            lon=data["lon"],
            accuracy_m=data.get("accuracy_m"),
            heading_deg=data.get("heading_deg"),
            speed_ms=data.get("speed_ms"),
            recorded_at=recorded_at,
        )
        db.session.add(ping)
        db.session.commit()

        LivePositionService._publish(trip_id, ping)
        return ping

    @staticmethod
    def to_broadcast_dict(ping: PositionPing) -> dict[str, Any]:
        """The D2 wire shape — shared by the publish path and the SSE snapshot
        (`LiveStreamService.stream_events`) so both serialize a ping identically."""
        user = db.session.query(User).filter_by(id=ping.user_id).first()
        name = f"{user.name} {user.surname}".strip() if user and user.surname else (user.name if user else "")
        return {
            "userId": str(ping.user_id),
            "name": name,
            "lat": ping.lat,
            "lon": ping.lon,
            "accuracyM": ping.accuracy_m,
            "headingDeg": ping.heading_deg,
            "speedMs": ping.speed_ms,
            "recordedAt": ping.recorded_at.isoformat(),
        }

    @staticmethod
    def _publish(trip_id: str, ping: PositionPing) -> None:
        message = LivePositionService.to_broadcast_dict(ping)
        try:
            live_redis().publish(live_channel(trip_id), json.dumps(message))
        except Exception as e:
            # Lossy by design (D2) — a dropped live-position broadcast never fails
            # the request; the ping itself is already durably persisted above.
            logger.warning("live_position_publish_failed", extra={"trip_id": trip_id, "error": str(e)})

    @staticmethod
    def latest_positions(trip_id: str) -> list[PositionPing]:
        """The newest persisted ping per trip member (DISTINCT ON user_id)."""
        return (
            db.session.query(PositionPing)
            .filter(PositionPing.trip_id == UUID(trip_id))
            .order_by(PositionPing.user_id, PositionPing.recorded_at.desc())
            .distinct(PositionPing.user_id)
            .all()
        )
