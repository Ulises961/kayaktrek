from typing import List, Optional, Union
from uuid import UUID

import logging

from sqlalchemy import and_, or_
from sqlalchemy.exc import NoResultFound
from sqlalchemy.orm import selectinload

from Api.database import db
from Models.block import Block
from Models.connection import Connection
from Models.invitation import Invitation
from Models.trip_member import MemberRoleType, TripMember
from Models.user import User

logger = logging.getLogger(__name__)


def _as_uuid(value: Union[str, UUID]) -> UUID:
    return value if isinstance(value, UUID) else UUID(value)


class BlockService:
    """One-way blocks plus the cross-cutting block check other services consult.

    "A blocks B" means, from A's side, B cannot see A's profile/logs, find A, request
    A as a buddy, or endorse A's logs. Creating a block is a hard reset: it tears down
    any connection between the pair and revokes pending trip invitations in either
    direction. Unblocking does not restore anything.
    """

    @staticmethod
    def block_exists_between(
        user_a_id: Union[str, UUID], user_b_id: Union[str, UUID]
    ) -> bool:
        """True if either user has blocked the other (block beats everything)."""
        a = _as_uuid(user_a_id)
        b = _as_uuid(user_b_id)
        return (
            db.session.query(Block.id)
            .filter(
                or_(
                    and_(Block.blocker_id == a, Block.blocked_id == b),
                    and_(Block.blocker_id == b, Block.blocked_id == a),
                )
            )
            .first()
            is not None
        )

    @staticmethod
    def _resolve_user(
        blocked_username: Optional[str], blocked_id: Optional[str]
    ) -> User:
        """Resolve a block target by username or id. Unlike a connection target, a
        block target is NOT gated by public visibility — you may block anyone (e.g. a
        former trip-mate whose profile is private)."""
        query = db.session.query(User)
        if blocked_id:
            target = query.filter_by(id=UUID(blocked_id)).first()
        elif blocked_username:
            target = query.filter_by(username=blocked_username).first()
        else:
            raise NoResultFound("No block target specified")

        if target is None or not target.active:
            raise NoResultFound("Paddler not found")
        return target

    @staticmethod
    def _revoke_invitations_between(user_a: UUID, user_b: UUID) -> None:
        """Delete pending trip invitations in either direction between the pair: any
        invitation to a trip led by one of them where the other is the invitee."""
        for leader_id, invitee_id in ((user_a, user_b), (user_b, user_a)):
            led_trip_ids = db.session.query(TripMember.trip_id).filter(
                TripMember.user_id == leader_id,
                TripMember.role == MemberRoleType.LEADER,
            )
            db.session.query(Invitation).filter(
                Invitation.user_id == invitee_id,
                Invitation.trip_id.in_(led_trip_ids),
            ).delete(synchronize_session=False)

    @staticmethod
    def create_block(
        blocker_id: str,
        blocked_username: Optional[str] = None,
        blocked_id: Optional[str] = None,
    ) -> Block:
        """Block a paddler, tearing down the relationship as a hard reset.

        Raises:
            NoResultFound: Target unknown or inactive (404).
            PermissionError: Target is the caller (403).
            ValueError: The block already exists (409).
        """
        blocker_uuid = UUID(blocker_id)
        target = BlockService._resolve_user(blocked_username, blocked_id)

        if target.id == blocker_uuid:
            raise PermissionError("You cannot block yourself")

        existing = (
            db.session.query(Block)
            .filter_by(blocker_id=blocker_uuid, blocked_id=target.id)
            .first()
        )
        if existing:
            raise ValueError("You have already blocked this paddler")

        # Hard reset: drop any connection (either direction) and pending invitations.
        db.session.query(Connection).filter(
            or_(
                and_(
                    Connection.requester_id == blocker_uuid,
                    Connection.addressee_id == target.id,
                ),
                and_(
                    Connection.requester_id == target.id,
                    Connection.addressee_id == blocker_uuid,
                ),
            )
        ).delete(synchronize_session=False)
        BlockService._revoke_invitations_between(blocker_uuid, target.id)

        block = Block(blocker_id=blocker_uuid, blocked_id=target.id)
        db.session.add(block)
        db.session.commit()
        db.session.refresh(block)
        logger.info(
            "user_blocked",
            extra={
                "block_id": str(block.id),
                "blocker_id": blocker_id,
                "blocked_id": str(target.id),
            },
        )
        return block

    @staticmethod
    def remove_block(block_id: str, user_id: str) -> None:
        """Unblock. Only the blocker may remove their block; does not restore anything.

        Raises:
            NoResultFound: No such block (404).
            PermissionError: Caller is not the blocker (403).
        """
        block = db.session.query(Block).filter_by(id=UUID(block_id)).first()
        if not block:
            raise NoResultFound(f"Block {block_id} not found")
        if block.blocker_id != UUID(user_id):
            raise PermissionError("You can only remove your own block")

        db.session.delete(block)
        db.session.commit()
        logger.info("user_unblocked", extra={"block_id": block_id, "user_id": user_id})

    @staticmethod
    def list_blocks(user_id: str) -> List[Block]:
        """The caller's blocks (newest first), for the manage screen."""
        return (
            db.session.query(Block)
            .options(selectinload(Block.blocked))
            .filter_by(blocker_id=UUID(user_id))
            .order_by(Block.created.desc())
            .all()
        )
