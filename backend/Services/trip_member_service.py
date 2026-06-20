from datetime import datetime, timezone
from typing import Any, Dict
from uuid import UUID

from flask import g
from sqlalchemy.exc import NoResultFound
import logging

from Models.trip_member import TripMember, MemberRoleType
from Models.user import User
from Api.database import db
from Schemas.base_schema import camelcase
from Services.crypto_service import decrypt, encrypt, encrypt_for_recipient, decrypt_as_recipient

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
        assert membership.medical_notes_nonce is not None
        assert membership.medical_notes_salt is not None
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
        membership.medical_notes_consent_at = None
        membership.medical_notes_leader_ciphertext = None
        membership.medical_notes_leader_nonce = None
        membership.medical_notes_leader_ephemeral_key = None
        db.session.commit()
        db.session.refresh(membership)
        logger.info("trip_medical_notes_revoked", extra={
            "user_id": str(g.current_user_id), "trip_id": trip_id,
        })
        return membership

    @staticmethod
    def share_medical_notes(trip_id: str, password: str) -> TripMember:
        """
        Decrypt the member's trip-level notes with their password, then ECIES-encrypt
        the plaintext for the trip leader's public key.

        Raises:
            NoResultFound: If the user is not a member of the trip
            ValueError: If no trip notes are stored, or the leader has no keypair
        """
        membership = TripMemberService.get_my_membership(trip_id)
        if not membership.medical_notes_ciphertext:
            raise ValueError("No trip medical notes stored — save notes before sharing")

        plaintext = decrypt(
            membership.medical_notes_ciphertext,
            membership.medical_notes_nonce,  # type: ignore
            membership.medical_notes_salt,  # type: ignore
            password,
        )

        leader = (
            db.session.query(User)
            .join(TripMember, TripMember.user_id == User.id)
            .filter(
                TripMember.trip_id == UUID(trip_id),
                TripMember.role == MemberRoleType.LEADER,
            )
            .first()
        )
        if not leader or not leader.public_key:
            raise ValueError("Trip leader has not set up their encryption keypair yet")

        ct, nonce, ephemeral = encrypt_for_recipient(plaintext, leader.public_key)
        membership.medical_notes_leader_ciphertext = ct
        membership.medical_notes_leader_nonce = nonce
        membership.medical_notes_leader_ephemeral_key = ephemeral
        membership.medical_notes_consent_at = datetime.now(timezone.utc)
        membership.float_plan_confirmed_at = datetime.now(timezone.utc)
        db.session.commit()
        db.session.refresh(membership)
        logger.info("trip_medical_notes_shared", extra={
            "user_id": str(g.current_user_id), "trip_id": trip_id,
        })
        return membership

    @staticmethod
    def read_shared_medical_notes(trip_id: str, member_id: str, leader_password: str) -> str:
        """
        Decrypt the ECIES-encrypted leader copy of a member's medical notes.
        Caller must be the trip leader.

        Raises:
            NoResultFound: If the trip or member does not exist
            PermissionError: If the caller is not the leader
            ValueError: If no notes have been shared, or the leader has no keypair
            cryptography.exceptions.InvalidTag: If leader_password is wrong
        """
        caller_membership = TripMemberService.get_my_membership(trip_id)
        if caller_membership.role != MemberRoleType.LEADER:
            raise PermissionError("Only the trip leader can read shared medical notes")

        target_membership = (
            db.session.query(TripMember)
            .filter_by(trip_id=UUID(trip_id), user_id=UUID(member_id))
            .first()
        )
        if not target_membership:
            raise NoResultFound(f"No membership found for member {member_id} in trip {trip_id}")
        if not target_membership.medical_notes_leader_ciphertext:
            raise ValueError("No shared medical notes for this member")

        leader = db.session.query(User).filter_by(id=UUID(str(g.current_user_id))).first()
        if not leader or not leader.private_key_ciphertext:
            raise ValueError("Leader keypair not found — generate your keypair first")

        return decrypt_as_recipient(
            target_membership.medical_notes_leader_ciphertext,
            target_membership.medical_notes_leader_nonce,  # type: ignore
            target_membership.medical_notes_leader_ephemeral_key,  # type: ignore
            leader.private_key_ciphertext,
            leader.private_key_nonce,  # type: ignore
            leader.private_key_salt,  # type: ignore
            leader_password,
        )
