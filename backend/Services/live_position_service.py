import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Optional
from uuid import UUID

from Api.database import db
from Api.redis import live_redis
from Models.position_ping import PositionPing
from Models.trip import Trip, TripStateType
from Models.user import User

logger = logging.getLogger(__name__)


def live_channel(trip_id: str) -> str:
    return f"live:trip:{trip_id}"


# A buffered ping newer than this is still news to the crew's live map; an older one is track only.
BACKLOG_PUBLISH_WINDOW = timedelta(minutes=5)


def _clamped_time(recorded_at: Optional[datetime], now: datetime) -> datetime:
    """The ping's own time, in UTC, never later than `now` (a device clock can run ahead)."""
    if recorded_at is None:
        return now
    if recorded_at.tzinfo is None:
        recorded_at = recorded_at.replace(tzinfo=timezone.utc)
    return min(recorded_at, now)


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
    def record_batch(trip_id: str, user_id: str, pings: list[dict[str, Any]]) -> dict[str, int]:
        """Persist pings a device buffered while offline; returns how many were new and how many
        were already stored.

        A ping already stored for this member at the same `recorded_at` counts as a duplicate, so
        a batch resent after a lost response stores nothing twice. A backlog never reaches the
        live map: only the newest new ping is published, and only when it is recent and newer than
        what the member's last stored ping already shows.

        Raises ValueError("trip_not_live") unless the trip is `happening`.
        """
        trip = db.session.query(Trip).filter_by(id=UUID(trip_id)).first()
        if trip is None or trip.state != TripStateType.HAPPENING:
            raise ValueError("trip_not_live")

        now = datetime.now(timezone.utc)
        ping_by_time: dict[datetime, dict[str, Any]] = {}
        for ping in pings:
            ping_by_time.setdefault(_clamped_time(ping.get("recorded_at"), now), ping)

        member_pings = db.session.query(PositionPing.recorded_at).filter(
            PositionPing.trip_id == UUID(trip_id), PositionPing.user_id == UUID(user_id)
        )
        stored_times = {
            row.recorded_at
            for row in member_pings.filter(
                PositionPing.recorded_at >= min(ping_by_time), PositionPing.recorded_at <= max(ping_by_time)
            )
        }
        previous_newest: Optional[datetime] = member_pings.order_by(PositionPing.recorded_at.desc()).limit(1).scalar()

        new_pings: list[PositionPing] = []
        for recorded_at in sorted(ping_by_time):
            if recorded_at in stored_times:
                continue
            ping = ping_by_time[recorded_at]
            new_pings.append(
                PositionPing(
                    trip_id=UUID(trip_id),
                    user_id=UUID(user_id),
                    lat=ping["lat"],
                    lon=ping["lon"],
                    accuracy_m=ping.get("accuracy_m"),
                    heading_deg=ping.get("heading_deg"),
                    speed_ms=ping.get("speed_ms"),
                    recorded_at=recorded_at,
                )
            )
        db.session.add_all(new_pings)
        db.session.commit()

        if new_pings:
            newest = new_pings[-1]
            is_recent = now - newest.recorded_at <= BACKLOG_PUBLISH_WINDOW
            if is_recent and (previous_newest is None or newest.recorded_at > previous_newest):
                LivePositionService._publish(trip_id, newest)

        logger.info(
            "position_batch_recorded",
            extra={"trip_id": trip_id, "user_id": user_id, "accepted": len(new_pings), "sent": len(pings)},
        )
        return {"accepted": len(new_pings), "duplicates": len(pings) - len(new_pings)}

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
    def snapshot(trip_id: str) -> list[dict[str, Any]]:
        """The newest ping per member in the D2 wire shape: the SSE stream's opening event
        and the polled `GET .../positions` answer are the same list."""
        return [LivePositionService.to_broadcast_dict(ping) for ping in LivePositionService.latest_positions(trip_id)]

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
