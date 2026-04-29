"""
Smoke-test task — verifies broker connectivity.

Run with:
    celery -A Api.celery_app call Tasks.ping.ping
Expected result: "pong"
"""
import logging

from Api.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(bind=True, name="Tasks.ping.ping")
def ping(self, request_id: str | None = None) -> str:
    logger.info("task_started", extra={"task_id": self.request.id, "request_id": request_id})
    try:
        result = "pong"
        logger.info("task_completed", extra={"task_id": self.request.id, "request_id": request_id})
        return result
    except Exception:
        logger.exception("task_failed", extra={"task_id": self.request.id, "request_id": request_id})
        raise
