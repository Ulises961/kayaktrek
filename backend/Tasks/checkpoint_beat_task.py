import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Optional

from flask import current_app
from sqlalchemy.orm import selectinload

from Api.celery_app import celery_app
from Api.database import db
from Models.day import Day
from Models.itinerary import Itinerary
from Models.logistics import Logistics
from Models.position_ping import PositionPing
from Models.trip import Trip, TripStateType
from Models.trip_member import TripMember
from Services.mail_service import send_template_email
from Services.Utils.timezone_utils import trip_today

logger = logging.getLogger(__name__)

DEFAULT_CHECKPOINT_ALERT_HOURS = 6


def _alert_threshold() -> timedelta:
    """How stale a trip's last position ping must be before its shore contact is
    emailed — and the cooldown before re-alerting the same trip.

    Read per call rather than at import: at module level the value is fixed when the
    worker process starts, so changing it needs a worker restart rather than a
    redeploy, and no test can vary it without importlib.reload (which rebinds this
    module's exception classes and breaks `except` elsewhere in the same worker).

    Note this is a threshold, not a schedule. How often the task runs is
    Api/celery_app.py's beat_schedule (hourly), and beat carries no configuration in
    the message it publishes — so this must be set on the *worker*, the only process
    that ever executes a task body.
    """
    hours = int(os.getenv("CHECKPOINT_ALERT_HOURS", str(DEFAULT_CHECKPOINT_ALERT_HOURS)))
    return timedelta(hours=hours)


@celery_app.task(name="Tasks.checkpoint_beat_task.check_missed_checkpoints", bind=True)
def check_missed_checkpoints(self, request_id: Optional[str] = None) -> None:
    """Alert the shore contact when a happening trip has gone quiet on a day it
    expected a checkpoint. Runs hourly (see Api/celery_app.py beat_schedule).

    A trip is alerted when, on today's Day, its most recent position ping is
    older than the CHECKPOINT_ALERT_HOURS threshold — and it hasn't already been alerted
    within that same window. Paused trips, trips with no Day scheduled for
    today, and trips that have never sent a position ping (never opted into
    live sharing) are skipped.
    """
    now = datetime.now(timezone.utc)
    run_date = now.date()
    threshold = _alert_threshold()

    trips = (
        db.session.query(Trip)
        .filter(Trip.state == TripStateType.HAPPENING, Trip.is_paused.is_(False))
        .options(
            selectinload(Trip.itinerary).selectinload(Itinerary.days),
            selectinload(Trip.trip_members).selectinload(TripMember.user),
        )
        .all()
    )

    alerted = 0
    for trip in trips:
        if trip.last_checkpoint_alert_at is not None and now - trip.last_checkpoint_alert_at < threshold:
            continue

        today_day = next(
            (day for day in (trip.itinerary.days if trip.itinerary else []) if day.date == trip_today(trip)),
            None,
        )
        if today_day is None:
            continue

        latest_ping = (
            db.session.query(PositionPing)
            .filter(PositionPing.trip_id == trip.id)
            .order_by(PositionPing.recorded_at.desc())
            .first()
        )
        if latest_ping is None or now - latest_ping.recorded_at < threshold:
            continue

        try:
            _send_checkpoint_alert(trip, today_day, now)
            trip.last_checkpoint_alert_at = now
            db.session.commit()
            alerted += 1
        except Exception:
            # Isolate one trip's failure (e.g. mail service down) from the rest of
            # the batch — committing per-trip means a mid-batch exception can only
            # discard *this* trip's uncommitted change, not the alerts already
            # confirmed sent for trips processed earlier in the same hourly run.
            # Not re-alerting here is correct: last_checkpoint_alert_at stays
            # unset, so the trip is retried on the next hourly beat tick.
            logger.exception("checkpoint_alert_failed", extra={"trip_id": str(trip.id)})
            db.session.rollback()

    logger.info(
        "checkpoint_beat_dispatched",
        extra={"task_id": self.request.id, "request_id": request_id, "alerted": alerted, "run_date": str(run_date)},
    )


def _send_checkpoint_alert(trip: Trip, today_day: Day, now: datetime) -> None:
    logistics = db.session.query(Logistics).filter_by(trip_id=trip.id).first()
    if not logistics or not logistics.shore_contact_email or not logistics.share_token:
        logger.warning("checkpoint_alert_no_shore_contact", extra={"trip_id": str(trip.id)})
        return

    frontend_url = current_app.config.get("FRONTEND_URL", "http://localhost:3000")

    if trip.date_from and trip.date_to:
        date_label = f"{trip.date_from.isoformat()} – {trip.date_to.isoformat()}"
    elif trip.date_from:
        date_label = f"from {trip.date_from.isoformat()}"
    else:
        date_label = "dates TBC"

    crew = [
        {
            "name": member.user.name + (f" {member.user.surname}" if member.user.surname else ""),
            "role": member.role.value,
            "emergencyContact": {
                "name": member.emergency_contact_name,
                "phone": member.emergency_contact_phone,
                "relationship": member.emergency_contact_relationship,
            },
        }
        for member in trip.trip_members
    ]

    send_template_email(
        to=logistics.shore_contact_email,
        subject=f"Check-in overdue — {trip.destination or 'kayak expedition'}",
        template="missed_checkpoint",
        destination=trip.destination or "kayak expedition",
        checkpoint_name=f"Day {today_day.day_number}",
        expected_by=now.strftime("%d %b %Y, %H:%M UTC"),
        date_label=date_label,
        crew=crew,
        float_plan_url=f"{frontend_url}/float-plan/{logistics.share_token}",
        support_email="support@kayakplanner.app",
    )
    logger.info("checkpoint_alert_sent", extra={"trip_id": str(trip.id)})
