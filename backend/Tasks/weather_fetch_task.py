import logging
from typing import Optional

from Api.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(name="Tasks.weather_fetch_task.fetch_weather", bind=True)
def fetch_weather(self, day_id: str, request_id: Optional[str] = None) -> None:
    """Fetch weather data from OpenMeteo for the given day and persist to DB."""
    logger.info(
        "weather_fetch_started",
        extra={"day_id": day_id, "request_id": request_id, "task_id": self.request.id},
    )
