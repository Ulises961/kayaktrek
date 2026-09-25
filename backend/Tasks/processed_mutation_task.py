import logging
from typing import Optional

from Api.celery_app import celery_app
from Services.mutation_queue_service import MutationQueueService

logger = logging.getLogger(__name__)


@celery_app.task(name="Tasks.processed_mutation_task.prune_processed_mutations", bind=True)
def prune_processed_mutations(self, request_id: Optional[str] = None) -> int:
    """Forget offline changes processed longer ago than the retention window (M9d).

    The record exists so a phone resending a batch does not apply it twice; a resend
    months later is not a case worth an ever-growing table. Runs nightly (see
    Api/celery_app.py beat_schedule).
    """
    deleted = MutationQueueService.prune()
    logger.info("processed_mutations_prune_done", extra={"deleted": deleted, "request_id": request_id})
    return deleted
