"""
GDPR Art. 17 — daily erasure task.

Finds users whose 30-day deletion grace period has elapsed, archives any
trips they led, deletes their personal logs, removes their avatar from
storage, and hard-deletes the user row (cascade handles TripMember,
AuthToken, Invitation, and UserCertification rows).

Schedule: daily via Celery Beat (registered in Api/celery_app.py).
"""
import logging
from datetime import datetime, timedelta, timezone

from Api.celery_app import celery_app
from Api.database import db
from Models.log import Log
from Models.trip import Trip, TripStateType
from Models.trip_member import TripMember, MemberRoleType
from Models.user import User
from Services.storage_service import StorageService

logger = logging.getLogger(__name__)

_GRACE_PERIOD = timedelta(days=30)


@celery_app.task(bind=True, name="Tasks.erasure.run_erasure")
def run_erasure(self, request_id: str | None = None) -> dict:
    logger.info("task_started", extra={"task_id": self.request.id, "request_id": request_id})
    cutoff = datetime.now(timezone.utc) - _GRACE_PERIOD

    candidates = (
        db.session.query(User)
        .filter(
            User.deletion_requested_at.isnot(None),
            User.deletion_requested_at < cutoff,
            User.active.is_(False),
        )
        .all()
    )

    erased = 0
    failed = 0

    for user in candidates:
        try:
            _erase_user(user)
            erased += 1
        except Exception:
            logger.exception("erasure_failed", extra={"user_id": str(user.id)})
            db.session.rollback()
            failed += 1

    result = {"erased": erased, "failed": failed}
    logger.info("task_completed", extra={"task_id": self.request.id, **result})
    return result


def _erase_user(user: User) -> None:
    user_id = str(user.id)

    # Archive trips where this user is the sole/any leader before TripMember rows vanish
    leader_memberships = (
        db.session.query(TripMember)
        .filter_by(user_id=user.id, role=MemberRoleType.LEADER)
        .all()
    )
    for membership in leader_memberships:
        trip = db.session.query(Trip).filter_by(id=membership.trip_id).first()
        if trip and trip.state != TripStateType.ARCHIVED:
            trip.state = TripStateType.ARCHIVED
        # Itinerary.user_id carries ON DELETE CASCADE (it also owns standalone,
        # non-trip itineraries, where cascading on user delete is correct). For a
        # trip itinerary we are archiving specifically to preserve it for the
        # remaining crew, that same cascade would otherwise silently delete the
        # route (Day/Point chain included, since those cascade off Itinerary) the
        # moment the user row goes — leaving an "archived" trip with no itinerary
        # at all. Null the ownership pointer first so the cascade has nothing to
        # walk. Note this is erasure, not anonymization: the leader's own
        # TripMember row (and AuthToken/Invitation/UserCertification rows) still
        # hard-cascade-delete below — there is no "Deleted User" placeholder, so
        # an archived trip retains its route but loses any record of who led it.
        if trip and trip.itinerary is not None:
            trip.itinerary.user_id = None

    # Delete personal logs (Log.user_id has no ON DELETE CASCADE, so this must be
    # explicit. Cascade on user_endorses_log.log_id handles junction rows for these logs.)
    # Endorsement rows where this user was the endorser are handled by the user
    # delete cascade below (user_endorses_log.endorsers FK has ondelete='CASCADE').
    db.session.query(Log).filter_by(user_id=user.id).delete()

    # Remove avatar/banner from storage before the row is gone
    if user.avatar_url:
        try:
            old_key = user.avatar_url.split("/avatars/")[-1]
            StorageService.delete(old_key, kind="avatar")
        except Exception as e:
            logger.error(
                "erasure_avatar_cleanup_failed",
                extra={"user_id": user_id, "error": str(e)},
            )

    if user.banner_url:
        try:
            old_key = user.banner_url.split("/banners/")[-1]
            StorageService.delete(old_key, kind="banner")
        except Exception as e:
            logger.error(
                "erasure_banner_cleanup_failed",
                extra={"user_id": user_id, "error": str(e)},
            )

    db.session.delete(user)
    db.session.commit()

    logger.info("user_erased", extra={"user_id": user_id})
