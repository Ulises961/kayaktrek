"""
Trip Leadership Service - Successor nomination and leaderless-trip claiming.

A trip can end up with no LEADER TripMember row (the leader left, or their
account was erased) while remaining fully visible to crew. This service lets
the leader designate a successor ahead of time, and lets crew reclaim
leadership once the trip is genuinely leaderless.
"""

import logging
from typing import Optional
from uuid import UUID

from flask import g
from sqlalchemy.exc import NoResultFound

from Api.database import db
from Models.trip import Trip, TripStateType
from Models.trip_member import TripMember, MemberRoleType

logger = logging.getLogger(__name__)


class TripLeadershipService:

    @staticmethod
    def nominate_successor(trip_id: str, member_user_id: str) -> TripMember:
        """
        Designate a crew member as the trip's successor. Clears any previous
        nomination first — at most one nominee per trip.

        Raises:
            NoResultFound: If the target is not a member of the trip
            ValueError: If the target is already the leader
        """
        target = (
            db.session.query(TripMember)
            .filter_by(trip_id=UUID(trip_id), user_id=UUID(member_user_id))
            .first()
        )
        if not target:
            raise NoResultFound(f"User {member_user_id} is not a member of trip {trip_id}")
        if target.role == MemberRoleType.LEADER:
            raise ValueError("Cannot nominate the current leader as their own successor")

        db.session.query(TripMember).filter_by(trip_id=UUID(trip_id)).update(
            {"nominated_successor": False}
        )
        target.nominated_successor = True
        db.session.commit()
        db.session.refresh(target)
        logger.info("trip_successor_nominated", extra={
            "trip_id": trip_id, "member_user_id": member_user_id,
        })
        return target

    @staticmethod
    def clear_nomination(trip_id: str) -> None:
        """Clear whichever member is currently nominated (no-op if none)."""
        db.session.query(TripMember).filter_by(trip_id=UUID(trip_id)).update(
            {"nominated_successor": False}
        )
        db.session.commit()
        logger.info("trip_successor_nomination_cleared", extra={"trip_id": trip_id})

    @staticmethod
    def claim_leadership(trip_id: str) -> TripMember:
        """
        Promote the calling crew member to leader.

        Raises:
            NoResultFound: If the trip doesn't exist or the caller isn't a member
            ValueError: If the trip already has a leader, or is ARCHIVED
            PermissionError: If a successor was nominated and the caller isn't them
        """
        try:
            # Row lock — serializes concurrent claim attempts on the same trip.
            trip = db.session.query(Trip).filter_by(id=UUID(trip_id)).with_for_update().first()
            if not trip:
                raise NoResultFound(f"Trip with id {trip_id} not found")
            if trip.state == TripStateType.ARCHIVED:
                raise ValueError("Cannot claim leadership of an archived trip")

            existing_leader = (
                db.session.query(TripMember)
                .filter_by(trip_id=UUID(trip_id), role=MemberRoleType.LEADER)
                .first()
            )
            if existing_leader:
                raise ValueError("Trip already has a leader")

            caller = (
                db.session.query(TripMember)
                .filter_by(trip_id=UUID(trip_id), user_id=UUID(str(g.current_user_id)))
                .first()
            )
            if not caller:
                raise NoResultFound(f"User {g.current_user_id} is not a member of trip {trip_id}")

            nominee: Optional[TripMember] = (
                db.session.query(TripMember)
                .filter_by(trip_id=UUID(trip_id), nominated_successor=True)
                .first()
            )
            if nominee and nominee.id != caller.id:
                raise PermissionError("A successor has already been nominated for this trip")
        except Exception:
            # The row lock above must never outlive a rejected claim.
            db.session.rollback()
            raise

        caller.role = MemberRoleType.LEADER
        caller.nominated_successor = False

        # The old leader-shared copy is ECIES-encrypted to the previous leader's
        # public key — unreadable by the new leader. Clear it trip-wide so the
        # existing share/not-shared UI naturally prompts members to re-share.
        db.session.query(TripMember).filter_by(trip_id=UUID(trip_id)).update({
            "medical_notes_leader_ciphertext": None,
            "medical_notes_leader_nonce": None,
            "medical_notes_leader_ephemeral_key": None,
            "medical_notes_consent_at": None,
        })
        db.session.commit()
        db.session.refresh(caller)
        logger.info("trip_leadership_claimed", extra={
            "trip_id": trip_id, "user_id": str(g.current_user_id),
        })
        return caller
