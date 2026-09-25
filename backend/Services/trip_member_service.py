from datetime import datetime, timezone
from typing import Any, Dict, Optional
from uuid import UUID

from flask import g
from sqlalchemy.exc import NoResultFound
import logging

from Models.trip import Trip, TripStateType
from Models.trip_member import TripMember, MemberRoleType
from Models.medical_notes_access_log import MedicalNotesAccessLog
from Models.user import User
from Api.database import db
from Schemas.base_schema import camelcase

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
    def _member_leaving(trip_id: str, member_id: str) -> TripMember:
        """A crew member of a trip under way. Callers check the caller is the leader."""
        trip = db.session.get(Trip, UUID(trip_id))
        if trip is None:
            raise NoResultFound(f"Trip {trip_id} not found")
        if trip.state != TripStateType.HAPPENING:
            raise ValueError("A departure is only recorded while the trip is under way")
        member = db.session.get(TripMember, UUID(member_id))
        if member is None or member.trip_id != trip.id:
            raise NoResultFound("That paddler is not on this trip")
        if member.role == MemberRoleType.LEADER:
            raise ValueError("The leader can't be recorded as having left; hand over leadership first")
        return member

    @staticmethod
    def record_departure(trip_id: str, member_id: str, left_at: datetime, note: Optional[str] = None) -> TripMember:
        """Record that a paddler left a trip under way (M9d): injury, evacuation, picked
        up by the support boat. The row stays — the float plan and shore contact need to
        know who was on the water, and until when."""
        member = TripMemberService._member_leaving(trip_id, member_id)
        member.left_at = left_at
        member.left_note = note.strip()[:500] if note and note.strip() else None
        db.session.commit()
        db.session.refresh(member)
        logger.info("crew_departure_recorded", extra={"trip_id": trip_id, "member_id": member_id})
        return member

    @staticmethod
    def clear_departure(trip_id: str, member_id: str) -> TripMember:
        """Undo a departure recorded by mistake."""
        member = TripMemberService._member_leaving(trip_id, member_id)
        member.left_at = None
        member.left_note = None
        db.session.commit()
        db.session.refresh(member)
        logger.info("crew_departure_cleared", extra={"trip_id": trip_id, "member_id": member_id})
        return member

    @staticmethod
    def get_trip_medical_notes(trip_id: str) -> Dict[str, str | None]:
        """
        Return the member's own sealed trip-level medical notes for the client to
        decrypt (M22). All three fields are None when nothing has been stored yet —
        the ordinary state of a new membership, not an error.

        Raises:
            NoResultFound: If the user is not a member of the trip
        """
        membership = TripMemberService.get_my_membership(trip_id)
        return {
            "ciphertext": membership.medical_notes_ciphertext,
            "nonce": membership.medical_notes_nonce,
            "salt": membership.medical_notes_salt,
        }

    @staticmethod
    def set_trip_medical_notes(
        trip_id: str, ciphertext: str, nonce: str, salt: str
    ) -> TripMember:
        """
        Store client-encrypted notes in the TripMember's own
        medical_notes_ciphertext/nonce/salt (M22).

        Raises:
            NoResultFound: If the user is not a member of the trip
        """
        membership = TripMemberService.get_my_membership(trip_id)
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
        Clear the member's own sealed trip notes and the leader-readable copy.

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
    def get_leader_public_key(trip_id: str) -> str:
        """
        Return the trip leader's X25519 public key so a crew member's client can
        ECIES-seal their notes for the leader itself (M22).

        A public key is public by definition; the gate is membership of the trip, which
        get_my_membership enforces, and it keeps the key off every broadly-dumped schema.

        Raises:
            NoResultFound: If the user is not a member of the trip
            ValueError: If the leader has not set up a keypair yet
        """
        TripMemberService.get_my_membership(trip_id)
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
        return leader.public_key

    @staticmethod
    def share_medical_notes(
        trip_id: str, ciphertext: str, nonce: str, ephemeral_key: str
    ) -> TripMember:
        """
        Store the leader-readable copy of the member's notes, ECIES-sealed on the
        client to the leader's public key (M22).

        The member must already have their own sealed copy stored: sharing without
        saving would leave a leader-readable note the member cannot read back, and the
        revoke path assumes the two move together.

        Raises:
            NoResultFound: If the user is not a member of the trip
            ValueError: If no trip notes are stored, or the leader has no keypair
        """
        membership = TripMemberService.get_my_membership(trip_id)
        if not membership.medical_notes_ciphertext:
            raise ValueError("No trip medical notes stored — save notes before sharing")

        # Re-checked server-side even though the client fetched this key to encrypt
        # with: it is the one part of the exchange the server can still verify, and a
        # leader with no keypair means the blob could never have been sealed correctly.
        TripMemberService.get_leader_public_key(trip_id)

        membership.medical_notes_leader_ciphertext = ciphertext
        membership.medical_notes_leader_nonce = nonce
        membership.medical_notes_leader_ephemeral_key = ephemeral_key
        membership.medical_notes_consent_at = datetime.now(timezone.utc)
        membership.float_plan_confirmed_at = datetime.now(timezone.utc)
        db.session.commit()
        db.session.refresh(membership)
        logger.info("trip_medical_notes_shared", extra={
            "user_id": str(g.current_user_id), "trip_id": trip_id,
        })
        return membership

    @staticmethod
    def read_shared_medical_notes(trip_id: str, member_id: str) -> Dict[str, str]:
        """
        Return the ECIES-sealed leader copy of a member's notes for the leader's client
        to decrypt (M22). Caller must be the trip leader.

        Raises:
            NoResultFound: If the trip or member does not exist
            PermissionError: If the caller is not the leader
            ValueError: If no notes have been shared, or the leader has no keypair
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
            raise ValueError("Leader keypair not found — set up your keypair first")

        # Accountability record (ADR-023). Since M22 the decryption happens on the
        # leader's device, so this logs the leader taking possession of the ciphertext
        # rather than a proven-successful decrypt. That is over-inclusive against the
        # old behaviour — a leader who fetches and then mistypes their password is now
        # logged — and it is the right trade: handing over the sealed notes is the
        # access the member is entitled to see, and it is the only part of the exchange
        # the server can still witness.
        db.session.add(MedicalNotesAccessLog(
            trip_member_id=target_membership.id,
            leader_id=leader.id,
        ))
        db.session.commit()

        return {
            "ciphertext": target_membership.medical_notes_leader_ciphertext,
            "nonce": target_membership.medical_notes_leader_nonce,  # type: ignore[dict-item]
            "ephemeralKey": target_membership.medical_notes_leader_ephemeral_key,  # type: ignore[dict-item]
        }

    @staticmethod
    def get_medical_notes_access_log(trip_id: str) -> list[MedicalNotesAccessLog]:
        """Return the access-log rows for the current user's own shared medical notes on
        this trip — who read them and when — most recent first."""
        membership = TripMemberService.get_my_membership(trip_id)
        return (
            db.session.query(MedicalNotesAccessLog)
            .filter_by(trip_member_id=membership.id)
            .order_by(MedicalNotesAccessLog.created.desc())
            .all()
        )
