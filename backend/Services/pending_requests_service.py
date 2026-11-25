from datetime import date
from typing import Dict
from uuid import UUID

from sqlalchemy import func

from Api.database import db
from Models.connection import Connection, ConnectionStatusType
from Models.endorsement_request import EndorsementRequest, EndorsementRequestStatusType
from Models.invitation import Invitation


class PendingRequestsService:
    """How many requests are waiting on a user, without loading any of them.

    The inbox badge is polled every few seconds, so each count is one `COUNT(*)` rather than
    the list endpoint's eager-loaded rows. Each filter mirrors the list that the count promises:
    a trip invitation that has not expired, a buddy request addressed to the user and still
    pending, an endorsement ask addressed to the user and still pending.
    """

    @staticmethod
    def summary(user_id: str) -> Dict[str, int]:
        user_uuid = UUID(user_id)

        trip_invitations = (
            db.session.query(func.count(Invitation.id))
            .filter(Invitation.user_id == user_uuid, Invitation.expires_at >= date.today())
            .scalar()
        )
        buddy_requests = (
            db.session.query(func.count(Connection.id))
            .filter(
                Connection.addressee_id == user_uuid,
                Connection.status == ConnectionStatusType.PENDING,
            )
            .scalar()
        )
        endorsement_requests = (
            db.session.query(func.count(EndorsementRequest.id))
            .filter(
                EndorsementRequest.addressee_id == user_uuid,
                EndorsementRequest.status == EndorsementRequestStatusType.PENDING,
            )
            .scalar()
        )

        return {
            "trip_invitations": trip_invitations,
            "buddy_requests": buddy_requests,
            "endorsement_requests": endorsement_requests,
        }
