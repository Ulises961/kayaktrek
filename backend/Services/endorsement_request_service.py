from typing import List, Optional
from uuid import UUID

import logging

from sqlalchemy.exc import NoResultFound
from sqlalchemy.orm import selectinload

from Api.database import db
from Models.endorsement_request import (
    EndorsementRequest,
    EndorsementRequestStatusType,
)
from Models.trip_member import TripMember
from Models.user import User
from Services.block_service import BlockService
from Services.log_service import LogService, LogNotEndorsableError

logger = logging.getLogger(__name__)


class EndorsementRequestService:
    """Author-initiated asks to endorse a trip-linked log (M7b §2b).

    The author asks a fellow trip member to endorse one of their logs. The addressee
    fulfils the ask through the existing endorse endpoint, which resolves the matching
    request to `actioned`. The "notification" surface is the in-app inbox
    (`list_requests` with direction='incoming'), mirroring how trip invitations work.
    """

    @staticmethod
    def _resolve_user(username: Optional[str], user_id: Optional[str]) -> User:
        query = db.session.query(User)
        if user_id:
            target = query.filter_by(id=UUID(user_id)).first()
        elif username:
            target = query.filter_by(username=username).first()
        else:
            raise NoResultFound("No addressee specified")
        if target is None or not target.active:
            raise NoResultFound("Paddler not found")
        return target

    @staticmethod
    def create_request(
        requester_id: str,
        log_id: str,
        addressee_username: Optional[str] = None,
        addressee_id: Optional[str] = None,
    ) -> EndorsementRequest:
        """Ask a trip-mate to endorse the caller's log. Eligibility mirrors the endorse
        rule from the author's side.

        Raises:
            NoResultFound: Log or addressee unknown (404).
            PermissionError: Caller is not the author, addressee is not a member of the
                log's trip, addressee is the author, or a block exists either way (403).
            LogNotEndorsableError: The log is not trip-linked (422).
            ValueError: The addressee already endorsed, or a request already exists (409).
        """
        log = LogService.get_log_by_id(log_id)

        if log.user_id != UUID(requester_id):
            raise PermissionError("Only the log's author can request endorsements")

        if log.trip_id is None:
            raise LogNotEndorsableError(
                "This log is not linked to a trip and cannot be endorsed"
            )

        addressee = EndorsementRequestService._resolve_user(addressee_username, addressee_id)

        if addressee.id == log.user_id:
            raise PermissionError("You cannot request an endorsement from yourself")

        if BlockService.block_exists_between(log.user_id, addressee.id):
            raise PermissionError("You cannot request an endorsement from this paddler")

        is_member = (
            db.session.query(TripMember.id)
            .filter_by(trip_id=log.trip_id, user_id=addressee.id)
            .first()
            is not None
        )
        if not is_member:
            raise PermissionError(
                "You can only ask a member of the log's trip to endorse it"
            )

        if addressee in log.user_endorsed_logs:
            raise ValueError("This paddler has already endorsed the log")

        existing = (
            db.session.query(EndorsementRequest)
            .filter_by(log_id=log.id, addressee_id=addressee.id)
            .first()
        )
        if existing:
            raise ValueError("An endorsement request already exists for this paddler")

        endorsement_request = EndorsementRequest(
            log_id=log.id,
            requester_id=UUID(requester_id),
            addressee_id=addressee.id,
            status=EndorsementRequestStatusType.PENDING,
        )
        db.session.add(endorsement_request)
        db.session.commit()
        db.session.refresh(endorsement_request)
        logger.info(
            "endorsement_requested",
            extra={
                "endorsement_request_id": str(endorsement_request.id),
                "log_id": str(log.id),
                "requester_id": requester_id,
                "addressee_id": str(addressee.id),
            },
        )
        return endorsement_request

    @staticmethod
    def list_requests(user_id: str, direction: str) -> List[EndorsementRequest]:
        """Pending requests for the caller. `direction='incoming'` returns asks the
        caller has been sent (the endorse-me inbox); `'outgoing'` returns the caller's
        outstanding asks.

        Raises:
            ValueError: Unrecognised direction (400).
        """
        user_uuid = UUID(user_id)
        query = (
            db.session.query(EndorsementRequest)
            .options(
                selectinload(EndorsementRequest.requester),
                selectinload(EndorsementRequest.addressee),
                selectinload(EndorsementRequest.log),
            )
            .filter(EndorsementRequest.status == EndorsementRequestStatusType.PENDING)
        )

        if direction == "incoming":
            query = query.filter(EndorsementRequest.addressee_id == user_uuid)
        elif direction == "outgoing":
            query = query.filter(EndorsementRequest.requester_id == user_uuid)
        else:
            raise ValueError("direction must be 'incoming' or 'outgoing'")

        return query.order_by(EndorsementRequest.created.desc()).all()

    @staticmethod
    def delete_request(request_id: str, user_id: str) -> None:
        """Cancel (author) or decline (addressee) a request — deletes the row so it can
        be re-requested.

        Raises:
            NoResultFound: No such request (404).
            PermissionError: Caller is neither party (403).
        """
        user_uuid = UUID(user_id)
        endorsement_request = (
            db.session.query(EndorsementRequest).filter_by(id=UUID(request_id)).first()
        )
        if not endorsement_request:
            raise NoResultFound(f"Endorsement request {request_id} not found")

        if user_uuid not in (
            endorsement_request.requester_id,
            endorsement_request.addressee_id,
        ):
            raise PermissionError("You are not part of this endorsement request")

        db.session.delete(endorsement_request)
        db.session.commit()
        logger.info(
            "endorsement_request_removed",
            extra={"endorsement_request_id": request_id, "user_id": user_id},
        )
