import logging
from datetime import date, datetime, timedelta, timezone
from typing import Optional
from uuid import UUID

from Api.celery_app import celery_app
from Api.database import db
from Models.day import Day
from Models.itinerary import Itinerary
from Models.position_ping import PositionPing
from Models.trip import Trip, TripStateType
from Models.trip_member import TripMember
from Services.expedition_log_service import ExpeditionLogService
from Services.Utils.timezone_utils import trip_today

logger = logging.getLogger(__name__)

_RETENTION_DAYS = 30


@celery_app.task(name="Tasks.expedition_log_task.generate_trip_day_logs", bind=True)
def generate_trip_day_logs(self, trip_id: str, day_date_iso: str, request_id: Optional[str] = None) -> None:
    """Generate an auto Log for every crew member of `trip_id` for one trip-local day."""
    day_date = date.fromisoformat(day_date_iso)
    members = db.session.query(TripMember).filter(TripMember.trip_id == UUID(trip_id)).all()

    generated = 0
    for member in members:
        try:
            if ExpeditionLogService.generate_day_log(trip_id, str(member.user_id), day_date) is not None:
                generated += 1
        except Exception:
            # Isolate one member's failure from the rest of the fan-out — without
            # this, one bad record (e.g. a malformed ping) would abort the loop and
            # silently skip every crew member after the failing one, with no retry:
            # nightly_log_fallback only ever dispatches for *yesterday* relative to
            # the night it runs, so a day missed here is never revisited.
            logger.exception(
                "expedition_log_generation_failed",
                extra={"trip_id": trip_id, "user_id": str(member.user_id), "day_date": day_date_iso},
            )
            db.session.rollback()

    logger.info(
        "expedition_log_task_completed",
        extra={
            "task_id": self.request.id,
            "request_id": request_id,
            "trip_id": trip_id,
            "day_date": day_date_iso,
            "member_count": len(members),
            "generated": generated,
        },
    )


@celery_app.task(name="Tasks.expedition_log_task.nightly_log_fallback", bind=True)
def nightly_log_fallback(self, request_id: Optional[str] = None) -> None:
    """Nightly safety net: close out yesterday's Day for every happening trip that
    hasn't had its logs generated another way (the primary trigger is the leader's
    Navigate-mode "close day" action, §8.3). Also runs the D3 position-ping
    retention sweep once trips are far enough past to no longer need the raw track.
    """
    trips = (
        db.session.query(Trip)
        .filter(Trip.state == TripStateType.HAPPENING)
        .all()
    )

    dispatched = 0
    for trip in trips:
        yesterday = trip_today(trip) - timedelta(days=1)
        has_day = (
            db.session.query(Day.id)
            .join(Itinerary, Day.itinerary_id == Itinerary.id)
            .filter(Itinerary.trip_id == trip.id, Day.date == yesterday)
            .first()
        )
        if has_day is None:
            continue
        generate_trip_day_logs.delay(str(trip.id), yesterday.isoformat(), request_id=request_id)
        dispatched += 1

    retention_cutoff = datetime.now(timezone.utc).date() - timedelta(days=_RETENTION_DAYS)
    stale_trip_ids = db.session.query(Trip.id).filter(
        Trip.state.in_([TripStateType.PAST, TripStateType.ARCHIVED]),
        Trip.date_to.isnot(None),
        Trip.date_to < retention_cutoff,
    )
    retained = (
        db.session.query(PositionPing)
        .filter(PositionPing.trip_id.in_(stale_trip_ids))
        .delete(synchronize_session=False)
    )
    db.session.commit()

    logger.info(
        "expedition_log_beat_dispatched",
        extra={
            "task_id": self.request.id,
            "request_id": request_id,
            "dispatched": dispatched,
            "retention_deleted": retained,
        },
    )
