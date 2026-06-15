import logging
from datetime import date, timedelta
from typing import Optional

from Api.celery_app import celery_app
from Api.database import db
from Models.day import Day
from Tasks.weather_fetch_task import fetch_weather

logger = logging.getLogger(__name__)


@celery_app.task(name="Tasks.weather_beat_task.refresh_upcoming_weather", bind=True)
def refresh_upcoming_weather(self, request_id: Optional[str] = None) -> None:
    today = date.today()
    cutoff = today + timedelta(days=10)

    days = (
        db.session.query(Day)
        .filter(Day.date.isnot(None), Day.date >= today, Day.date <= cutoff)
        .all()
    )

    for day in days:
        fetch_weather.delay(str(day.id), request_id=request_id)

    logger.info(
        "weather_beat_dispatched",
        extra={"count": len(days), "today": str(today), "cutoff": str(cutoff)},
    )
