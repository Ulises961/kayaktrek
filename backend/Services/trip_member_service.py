from datetime import datetime, timezone
from typing import Any, Dict
from uuid import UUID

from flask import g
from sqlalchemy.exc import NoResultFound
import logging

from Models.trip_member import TripMember
from Models.user import User
from Api.database import db
from Schemas.base_schema import camelcase
from Services.crypto_service import decrypt

logger = logging.getLogger(__name__)

_FLOAT_PLAN_FIELDS = frozenset({
    "vessel_make", "vessel_model", "vessel_length_cm",
    "vessel_color_primary", "vessel_color_secondary",
    "emergency_contact_name", "emergency_contact_phone",
    "emergency_contact_relationship",
})


class TripMemberService:

    @staticmethod
    def get_my_membership(trip_id: str) -> TripMember:
        """Return the TripMember row for the current user in the given trip."""
        membership = (
            db.session.query(TripMember)
            .filter_by(user_id=UUID(str(g.current_user_id)), trip_id=UUID(trip_id))
            .first()
        )
        if not membership:
            raise NoResultFound(f"No membership found for trip {trip_id}")
        return membership

    @staticmethod
    def update_my_float_plan(trip_id: str, data: Dict[str, Any]) -> TripMember:
        """
        Update vessel and emergency contact fields on the current user's TripMember.
        Sets float_plan_confirmed_at on every successful save.

        Raises:
            NoResultFound: If the user is not a member of the trip
        """
        membership = TripMemberService.get_my_membership(trip_id)

        for field in _FLOAT_PLAN_FIELDS:
            key = camelcase(field)
            if key in data:
                setattr(membership, field, data[key])

        membership.float_plan_confirmed_at = datetime.now(timezone.utc)
        db.session.commit()
        db.session.refresh(membership)
        logger.info("float_plan_updated", extra={
            "user_id": str(g.current_user_id), "trip_id": trip_id,
        })
        return membership

    @staticmethod
    def share_medical_notes(trip_id: str, password: str) -> TripMember:
        """
        Decrypt User.medical_notes in memory and copy plaintext to TripMember.
        Requires prior consent (medical_notes_consent_at set on User).
        The user has explicitly acknowledged sharing with the trip leader.

        Raises:
            NoResultFound: If the user is not a member of the trip
            ValueError: If no consent is on record, no notes are stored,
                        or the password is wrong
        """
        user_id = str(g.current_user_id)
        user = db.session.query(User).filter_by(id=UUID(user_id)).first()
        if not user:
            raise NoResultFound("User not found")
        if not user.medical_notes_consent_at:
            raise ValueError("No medical consent on record — grant consent before sharing")
        if not user.medical_notes_ciphertext:
            raise ValueError("No medical notes stored")

        plaintext = decrypt(
            user.medical_notes_ciphertext,
            user.medical_notes_nonce,
            user.medical_notes_salt,
            password,
        )

        membership = TripMemberService.get_my_membership(trip_id)
        membership.medical_notes = plaintext
        membership.medical_notes_consent_at = datetime.now(timezone.utc)
        membership.float_plan_confirmed_at = datetime.now(timezone.utc)
        db.session.commit()
        db.session.refresh(membership)
        logger.info("medical_notes_shared", extra={"user_id": user_id, "trip_id": trip_id})
        return membership
