import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import or_

from Api.celery_app import celery_app
from Api.database import db
from Models.session import Session

logger = logging.getLogger(__name__)

# How long a dead session is kept before deletion. Revoked rows are worth keeping
# briefly: "signed out on a device I don't recognise" is a question users ask after
# the fact, and the row is the only record of the device and place it was used from.
_RETENTION = timedelta(days=30)


@celery_app.task(name="Tasks.session_cleanup_task.purge_dead_sessions", bind=True)
def purge_dead_sessions(self, request_id: Optional[str] = None) -> int:
    """Delete sessions that expired or were revoked more than the retention window ago.

    Nothing here affects authentication — an expired or revoked session already fails
    every check. This only stops the table growing without bound, one row per login,
    forever. Runs nightly (see Api/celery_app.py beat_schedule).
    """
    cutoff = datetime.now(timezone.utc) - _RETENTION
    deleted = (
        db.session.query(Session)
        .filter(
            or_(
                Session.expires_at < cutoff,
                Session.revoked_at.is_not(None) & (Session.revoked_at < cutoff),
            )
        )
        .delete(synchronize_session=False)
    )
    db.session.commit()
    logger.info(
        "sessions_purged",
        extra={"count": deleted, "cutoff": cutoff.isoformat(), "request_id": request_id},
    )
    return deleted
