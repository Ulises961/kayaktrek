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

CHECKPOINT_ALERT_HOURS = int(os.getenv("CHECKPOINT_ALERT_HOURS", "6"))


@celery_app.task(name="Tasks.checkpoint_beat_task.check_missed_checkpoints", bind=True)
def check_missed_checkpoints(self, request_id: Optional[str] = None) -> None:
    """Alert the shore contact when a happening trip has gone quiet on a day it
    expected a checkpoint. Runs hourly (see Api/celery_app.py beat_schedule).

    A trip is alerted when, on today's Day, its most recent position ping is
    older than CHECKPOINT_ALERT_HOURS — and it hasn't already been alerted
    within that same window. Paused trips, trips with no Day scheduled for
    today, and trips that have never sent a position ping (never opted into
    live sharing) are skipped.
    """
    now = datetime.now(timezone.utc)
    run_date = now.date()
    threshold = timedelta(hours=CHECKPOINT_ALERT_HOURS)

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

        _send_checkpoint_alert(trip, today_day, now)
        trip.last_checkpoint_alert_at = now
        alerted += 1

    db.session.commit()
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
