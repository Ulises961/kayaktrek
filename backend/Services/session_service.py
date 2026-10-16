"""Per-device sessions and instant revocation.

A Session row is one device's refresh-token chain. Its id travels as the `sid` claim on
every token issued to that device, which is what makes revocation family-scoped —
ending one session leaves the user's other devices signed in.

Access tokens stay stateless: nothing here is read on a normal authenticated request
except a single Redis GET against the denylist of revoked session ids.
"""
import logging
from datetime import datetime, timedelta, timezone
from typing import List, Optional
from uuid import UUID

from Api.database import db
from Api.redis import revocation_redis
from Models.session import Session

logger = logging.getLogger(__name__)

ACCESS_TOKEN_LIFETIME = timedelta(minutes=15)
REFRESH_TOKEN_LIFETIME = timedelta(days=30)

_DENYLIST_PREFIX = "revoked:"


class SessionService:

    @staticmethod
    def start(
        user_id: UUID,
        device_label: Optional[str] = None,
        location_label: Optional[str] = None,
    ) -> Session:
        """Open a new session for one device. Called on login, never on refresh."""
        session = Session()
        session.user_id = user_id
        session.expires_at = datetime.now(timezone.utc) + REFRESH_TOKEN_LIFETIME
        session.device_label = device_label
        session.location_label = location_label
        db.session.add(session)
        db.session.commit()
        logger.info(
            "session_started",
            extra={"session_id": str(session.id), "user_id": str(user_id)},
        )
        return session

    @staticmethod
    def get_usable(session_id: str, user_id: UUID) -> Optional[Session]:
        """The named session, if it belongs to this user and may still be refreshed."""
        try:
            session = db.session.get(Session, UUID(session_id))
        except (ValueError, AttributeError):
            return None
        if not session or session.user_id != user_id or not session.is_usable:
            return None
        return session

    @staticmethod
    def list_for_user(user_id: UUID) -> List[Session]:
        """Every session still usable by this user, most recently active first."""
        sessions = (
            db.session.query(Session)
            .filter_by(user_id=user_id, revoked_at=None)
            .order_by(Session.last_used_at.desc())
            .all()
        )
        return [session for session in sessions if session.is_usable]

    @staticmethod
    def rotate(
        session: Session,
        location_label: Optional[str] = None,
        device_label: Optional[str] = None,
    ) -> None:
        """Advance the rotation counter on a successful refresh and mark it active.

        The location is re-resolved on every refresh so a device that has moved shows
        where it is now rather than where it first signed in. The device is re-resolved
        for a narrower reason: a session opened without a label heals on its next refresh
        instead of needing the paddler to sign out everywhere to clear "Unknown device".

        Both are only written when resolved. A refresh from a client that sends nothing
        usable must leave a good label alone rather than blank it.
        """
        session.token_version += 1
        session.last_used_at = datetime.now(timezone.utc)
        if location_label:
            session.location_label = location_label
        if device_label:
            session.device_label = device_label
        db.session.commit()

    @staticmethod
    def revoke(session: Session, reason: str) -> None:
        """End one session immediately: mark the row and denylist its access tokens."""
        if session.revoked_at is None:
            session.revoked_at = datetime.now(timezone.utc)
            db.session.commit()
        SessionService._denylist(str(session.id))
        logger.info(
            "session_revoked",
            extra={
                "session_id": str(session.id),
                "user_id": str(session.user_id),
                "reason": reason,
            },
        )

    @staticmethod
    def revoke_all_for_user(user_id: UUID, reason: str) -> int:
        """End every one of a user's sessions. Returns how many were still open.

        The caller is responsible for bumping the user's token_version — that is the
        global kill switch, and this method is also used where only the sessions go.
        """
        sessions = (
            db.session.query(Session).filter_by(user_id=user_id, revoked_at=None).all()
        )
        revoked_at = datetime.now(timezone.utc)
        for session in sessions:
            session.revoked_at = revoked_at
        db.session.commit()
        for session in sessions:
            SessionService._denylist(str(session.id))
        logger.info(
            "sessions_revoked_all",
            extra={"user_id": str(user_id), "count": len(sessions), "reason": reason},
        )
        return len(sessions)

    @staticmethod
    def is_revoked(session_id: str) -> bool:
        """Whether this session id is on the denylist.

        Fails open. An unreachable Redis lets a revoked access token live out its
        remaining lifetime — at most ACCESS_TOKEN_LIFETIME. Failing closed would turn a
        Redis blip into a forced logout for every user on the platform, a worse failure
        than the one it prevents.
        """
        try:
            return revocation_redis().exists(f"{_DENYLIST_PREFIX}{session_id}") > 0
        except Exception as error:
            # Deliberately broad: "unavailable" is not only RedisError. A malformed
            # REVOCATION_REDIS_URL raises ValueError from the client constructor and a dead
            # socket can surface as OSError, and neither may be allowed to fail the request —
            # the denylist only shortens a window that the token's own expiry closes anyway.
            logger.warning("revocation_denylist_unavailable", extra={"error": str(error)})
            return False

    @staticmethod
    def _denylist(session_id: str) -> None:
        """Block this session's outstanding access tokens until they expire on their own.

        The TTL matches the access-token lifetime, so keys expire exactly when they stop
        mattering and the denylist stays proportional to recent revocations, not to the
        number of users.
        """
        try:
            revocation_redis().setex(
                f"{_DENYLIST_PREFIX}{session_id}",
                ACCESS_TOKEN_LIFETIME,
                "1",
            )
        except Exception as error:
            # Broad for the same reason as the read path, and with a smaller consequence: the
            # session row is already revoked, so refresh is dead either way — only the current
            # access token survives, and only until it expires. Raising here would 500 a
            # sign-out that has, in every way that matters, already succeeded.
            logger.warning(
                "revocation_denylist_write_failed",
                extra={"session_id": session_id, "error": str(error)},
            )
