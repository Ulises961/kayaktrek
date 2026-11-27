from datetime import datetime, timezone
from typing import Dict, Optional
from uuid import UUID

import logging

from sqlalchemy import func

from Api.database import db
from Models.connection import Connection
from Models.notification import Notification, NotificationKind
from Models.trip_member import MemberRoleType, TripMember

logger = logging.getLogger(__name__)


class NotificationService:
    """Tells a user that a request they sent has been accepted.

    Notifications are added to the caller's open transaction, so they are committed with the
    acceptance and discarded with it: a failed accept notifies nobody.
    """

    @staticmethod
    def notify_trip_invitation_accepted(trip_id: UUID, invitee_id: UUID) -> None:
        """Tell the trip's leader(s). An invitation does not record who sent it, and only a
        leader can invite."""
        leader_ids = [
            row[0]
            for row in db.session.query(TripMember.user_id)
            .filter(TripMember.trip_id == trip_id, TripMember.role == MemberRoleType.LEADER)
            .all()
        ]
        for leader_id in leader_ids:
            db.session.add(
                Notification(
                    user_id=leader_id,
                    kind=NotificationKind.TRIP_INVITATION_ACCEPTED,
                    actor_id=invitee_id,
                    trip_id=trip_id,
                )
            )

    @staticmethod
    def notify_buddy_request_accepted(connection: Connection) -> None:
        """Tell the paddler who sent the request that the addressee accepted it."""
        db.session.add(
            Notification(
                user_id=connection.requester_id,
                kind=NotificationKind.BUDDY_REQUEST_ACCEPTED,
                actor_id=connection.addressee_id,
            )
        )

    @staticmethod
    def unread_counts(user_id: UUID) -> Dict[str, int]:
        rows = (
            db.session.query(Notification.kind, func.count(Notification.id))
            .filter(Notification.user_id == user_id, Notification.read_at.is_(None))
            .group_by(Notification.kind)
            .all()
        )
        by_kind = {kind: count for kind, count in rows}
        return {
            "accepted_trip_invitations": by_kind.get(NotificationKind.TRIP_INVITATION_ACCEPTED, 0),
            "accepted_buddy_requests": by_kind.get(NotificationKind.BUDDY_REQUEST_ACCEPTED, 0),
        }

    @staticmethod
    def mark_read(user_id: str, kind_value: Optional[str]) -> int:
        """Mark the caller's unread notifications of one kind as read. Returns how many.

        Raises:
            ValueError: An unrecognised or missing kind (400).
        """
        try:
            kind = NotificationKind(kind_value)
        except ValueError:
            valid = [member.value for member in NotificationKind]
            raise ValueError(f"Invalid kind '{kind_value}'. Valid values: {valid}")

        marked = (
            db.session.query(Notification)
            .filter(
                Notification.user_id == UUID(user_id),
                Notification.kind == kind,
                Notification.read_at.is_(None),
            )
            .update({Notification.read_at: datetime.now(timezone.utc)}, synchronize_session=False)
        )
        db.session.commit()
        logger.info("notifications_marked_read", extra={"user_id": user_id, "kind": kind.value, "count": marked})
        return marked
