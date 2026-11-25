from datetime import datetime, timezone
from typing import List, Optional
from uuid import UUID

import logging

from sqlalchemy import and_, or_
from sqlalchemy.exc import NoResultFound
from sqlalchemy.orm import selectinload

from Api.database import db
from Models.connection import Connection, ConnectionStatusType
from Models.user import User
from Services.block_service import BlockService
from Services.notification_service import NotificationService

logger = logging.getLogger(__name__)


class ConnectionService:
    """Buddy connections — a symmetric relationship stored as one directed row per pair.

    A request is created `pending` and flips to `accepted` when the addressee accepts.
    There is exactly one row per pair of users; a mirror duplicate (B->A while A->B
    exists) is rejected on create. The block check layers into `_resolve_target` and
    `request_connection` without changing their signatures.
    """

    @staticmethod
    def _resolve_target(
        addressee_username: Optional[str], addressee_id: Optional[str]
    ) -> User:
        """Resolve a connection target by username or id, applying public visibility.

        Raises NoResultFound — a single neutral 404 at the resource — for unknown,
        inactive, deletion-pending, or non-public targets, so a private account is
        indistinguishable from a missing one (no existence oracle).
        """
        query = db.session.query(User)
        if addressee_id:
            target = query.filter_by(id=UUID(addressee_id)).first()
        elif addressee_username:
            target = query.filter_by(username=addressee_username).first()
        else:
            raise NoResultFound("No connection target specified")

        if (
            target is None
            or not target.active
            or target.deletion_requested_at is not None
            or not target.profile_is_public
        ):
            raise NoResultFound("Paddler not found")
        return target

    @staticmethod
    def request_connection(
        requester_id: str,
        addressee_username: Optional[str] = None,
        addressee_id: Optional[str] = None,
    ) -> Connection:
        """Create a pending buddy request from the caller to the resolved target.

        Raises:
            NoResultFound: Target unknown or not publicly visible (404).
            PermissionError: Target is the caller (403).
            ValueError: A connection already exists in either direction (409).
        """
        requester_uuid = UUID(requester_id)
        target = ConnectionService._resolve_target(addressee_username, addressee_id)

        # A block in either direction makes the target unreachable — neutral 404,
        # indistinguishable from a missing/private account (no disclosure).
        if BlockService.block_exists_between(requester_uuid, target.id):
            raise NoResultFound("Paddler not found")

        if target.id == requester_uuid:
            raise PermissionError("You cannot connect with yourself")

        existing = (
            db.session.query(Connection)
            .filter(
                or_(
                    and_(
                        Connection.requester_id == requester_uuid,
                        Connection.addressee_id == target.id,
                    ),
                    and_(
                        Connection.requester_id == target.id,
                        Connection.addressee_id == requester_uuid,
                    ),
                )
            )
            .first()
        )
        if existing:
            raise ValueError("A connection already exists with this paddler")

        connection = Connection(
            requester_id=requester_uuid,
            addressee_id=target.id,
            status=ConnectionStatusType.PENDING,
        )
        db.session.add(connection)
        db.session.commit()
        db.session.refresh(connection)
        logger.info(
            "connection_requested",
            extra={
                "connection_id": str(connection.id),
                "requester_id": requester_id,
                "addressee_id": str(target.id),
            },
        )
        return connection

    @staticmethod
    def accept_connection(connection_id: str, user_id: str) -> Connection:
        """Accept a pending request. Only the addressee may accept; idempotent if
        already accepted.

        Raises:
            NoResultFound: No such connection (404).
            PermissionError: Caller is not the addressee (403).
        """
        connection = (
            db.session.query(Connection).filter_by(id=UUID(connection_id)).first()
        )
        if not connection:
            raise NoResultFound(f"Connection {connection_id} not found")

        if connection.addressee_id != UUID(user_id):
            raise PermissionError("Only the addressee can accept this request")

        if connection.status is not ConnectionStatusType.ACCEPTED:
            connection.status = ConnectionStatusType.ACCEPTED
            connection.responded_at = datetime.now(timezone.utc)
            NotificationService.notify_buddy_request_accepted(connection)
            db.session.commit()
            db.session.refresh(connection)
            logger.info(
                "connection_accepted",
                extra={"connection_id": connection_id, "user_id": user_id},
            )
        return connection

    @staticmethod
    def remove_connection(connection_id: str, user_id: str) -> None:
        """Delete a connection. Covers declining a pending request and unfriending an
        accepted one; either party may remove it.

        Raises:
            NoResultFound: No such connection (404).
            PermissionError: Caller is not part of the connection (403).
        """
        user_uuid = UUID(user_id)
        connection = (
            db.session.query(Connection).filter_by(id=UUID(connection_id)).first()
        )
        if not connection:
            raise NoResultFound(f"Connection {connection_id} not found")

        if user_uuid not in (connection.requester_id, connection.addressee_id):
            raise PermissionError("You are not part of this connection")

        db.session.delete(connection)
        db.session.commit()
        logger.info(
            "connection_removed",
            extra={"connection_id": connection_id, "user_id": user_id},
        )

    @staticmethod
    def list_connections(user_id: str, status: Optional[str] = None) -> List[Connection]:
        """Return the caller's connections (both directions), newest first.

        `status` optionally filters to `pending` or `accepted`.

        Raises:
            ValueError: An unrecognised status filter (400).
        """
        user_uuid = UUID(user_id)
        query = (
            db.session.query(Connection)
            .options(
                selectinload(Connection.requester),
                selectinload(Connection.addressee),
            )
            .filter(
                or_(
                    Connection.requester_id == user_uuid,
                    Connection.addressee_id == user_uuid,
                )
            )
        )

        if status:
            try:
                status_enum = ConnectionStatusType(status)
            except ValueError:
                valid = [s.value for s in ConnectionStatusType]
                raise ValueError(f"Invalid status '{status}'. Valid values: {valid}")
            query = query.filter(Connection.status == status_enum)

        return query.order_by(Connection.created.desc()).all()
