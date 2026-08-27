import logging
from typing import Optional

from Api.celery_app import celery_app
from Services import tile_cache

logger = logging.getLogger(__name__)


@celery_app.task(name="Tasks.tile_cache_task.prune_tile_cache", bind=True)
def prune_tile_cache(self, request_id: Optional[str] = None) -> dict:
    """Evict old tiles until the cache is under its cap and the disk has headroom.

    Nothing here affects correctness — an evicted tile is one upstream refetch. This exists
    because the tile cache is the only unbounded-by-design thing the app writes to disk, and
    on a one-box deployment it shares a filesystem with Postgres: a full disk stops Postgres
    writing WAL. See Services/tile_cache.py for why the cap is a blast-radius control rather
    than a cost control, and why it should be generous rather than tight.

    Runs nightly (see Api/celery_app.py beat_schedule). Beat only publishes the task name;
    the thresholds are read from the worker's own environment, which is where
    TILE_CACHE_MAX_BYTES and TILE_CACHE_MIN_FREE_BYTES belong.
    """
    summary = tile_cache.sweep()
    logger.info("tile_cache_pruned", extra={**summary, "request_id": request_id})
    return summary
