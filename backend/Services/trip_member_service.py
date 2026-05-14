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
from Services.crypto_service import decrypt, encrypt

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
    def get_trip_medical_notes(trip_id: str, password: str) -> str | None:
        """
        Decrypt the member's own trip-level medical notes and return plaintext.
        Returns None if no notes have been stored yet.

        Raises:
            NoResultFound: If the user is not a member of the trip
        """
        membership = TripMemberService.get_my_membership(trip_id)
        if not membership.medical_notes_ciphertext:
            return None
        return decrypt(
            membership.medical_notes_ciphertext,
            membership.medical_notes_nonce,
            membership.medical_notes_salt,
            password,
        )

    @staticmethod
    def set_trip_medical_notes(trip_id: str, plaintext: str, password: str) -> TripMember:
        """
        Encrypt plaintext and store in TripMember's own medical_notes_ciphertext/nonce/salt.

        Raises:
            NoResultFound: If the user is not a member of the trip
            ValueError: If plaintext is empty
        """
        plaintext = plaintext.strip()
        if not plaintext:
            raise ValueError("medicalNotes is required")
        membership = TripMemberService.get_my_membership(trip_id)
        ciphertext, nonce, salt = encrypt(plaintext, password)
        membership.medical_notes_ciphertext = ciphertext
        membership.medical_notes_nonce = nonce
        membership.medical_notes_salt = salt
        db.session.commit()
        db.session.refresh(membership)
        logger.info("trip_medical_notes_saved", extra={
            "user_id": str(g.current_user_id), "trip_id": trip_id,
        })
        return membership

    @staticmethod
    def revoke_trip_medical_notes(trip_id: str) -> TripMember:
        """
        Clear the member's own encrypted trip notes and the leader-visible plaintext copy.

        Raises:
            NoResultFound: If the user is not a member of the trip
        """
        membership = TripMemberService.get_my_membership(trip_id)
        membership.medical_notes_ciphertext = None
        membership.medical_notes_nonce = None
        membership.medical_notes_salt = None
        membership.medical_notes = None
        membership.medical_notes_consent_at = None
        db.session.commit()
        db.session.refresh(membership)
        logger.info("trip_medical_notes_revoked", extra={
            "user_id": str(g.current_user_id), "trip_id": trip_id,
        })
        return membership

    @staticmethod
    def share_medical_notes(trip_id: str, password: str) -> TripMember:
        """
        Decrypt the member's trip-level notes and write plaintext to the leader-visible column.
        The elevated token proves the user authenticated; the password is required to decrypt.

        Raises:
            NoResultFound: If the user is not a member of the trip
            ValueError: If no trip notes are stored
        """
        membership = TripMemberService.get_my_membership(trip_id)
        if not membership.medical_notes_ciphertext:
            raise ValueError("No trip medical notes stored — save notes before sharing")

        plaintext = decrypt(
            membership.medical_notes_ciphertext,
            membership.medical_notes_nonce,
            membership.medical_notes_salt,
            password,
        )

        membership.medical_notes = plaintext
        membership.medical_notes_consent_at = datetime.now(timezone.utc)
        membership.float_plan_confirmed_at = datetime.now(timezone.utc)
        db.session.commit()
        db.session.refresh(membership)
        logger.info("trip_medical_notes_shared", extra={
            "user_id": str(g.current_user_id), "trip_id": trip_id,
        })
        return membership
