import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import UUID
import logging

from sqlalchemy.exc import NoResultFound
from sqlalchemy.orm import joinedload

from Api.database import db
from Models.logistics import Logistics
from Models.trip import Trip, TripStateType
from Models.trip_member import TripMember, MemberRoleType
from Schemas.base_schema import camelcase

logger = logging.getLogger(__name__)

_LEADER_FIELDS = frozenset({
    "shore_contact_name", "shore_contact_email",
    "shore_contact_phone", "shore_contact_relationship",
})
_CREW_FIELDS = frozenset({"shuttle_notes", "shuttle_meeting_time"})


def _require_editable(trip: Trip) -> None:
    if trip.state in (TripStateType.PAST, TripStateType.ARCHIVED):
        raise ValueError("Logistics cannot be edited on a completed trip")


class LogisticsService:

    @staticmethod
    def get(trip_id: str) -> Optional[Logistics]:
        return db.session.query(Logistics).filter_by(trip_id=UUID(trip_id)).first()

    @staticmethod
    def upsert(trip_id: str, data: dict, user_id: str) -> Logistics:
        """
        Create or update the Logistics record for a trip.

        Leader-only fields (shore_contact_*) raise PermissionError if a crew member
        tries to set them.
        shuttle_notes and shuttle_meeting_time are writable by any crew member.

        Raises:
            NoResultFound: Trip does not exist or user is not a member
            PermissionError: Crew member tries to write a leader-only field
            ValueError: Trip is past/archived
        """
        trip = db.session.query(Trip).filter_by(id=UUID(trip_id)).first()
        if not trip:
            raise NoResultFound(f"Trip {trip_id} not found")
        _require_editable(trip)

        membership = db.session.query(TripMember).filter_by(
            user_id=UUID(user_id), trip_id=UUID(trip_id)
        ).first()
        if not membership:
            raise NoResultFound(f"User {user_id} is not a member of trip {trip_id}")

        is_leader = membership.role == MemberRoleType.LEADER

        logistics = db.session.query(Logistics).filter_by(trip_id=UUID(trip_id)).first()
        if logistics is None:
            logistics = Logistics()
            logistics.trip_id = UUID(trip_id)
            db.session.add(logistics)

        for field in _LEADER_FIELDS:
            key = camelcase(field)
            if key in data:
                if not is_leader:
                    raise PermissionError(f"Only the trip leader can update '{field}'")
                setattr(logistics, field, data[key])

        for field in _CREW_FIELDS:
            key = camelcase(field)
            if key in data:
                setattr(logistics, field, data[key])

        db.session.commit()
        db.session.refresh(logistics)
        logger.info("logistics_upserted", extra={"trip_id": trip_id, "user_id": user_id})
        return logistics

    @staticmethod
    def build_snapshot(trip_id: str) -> dict:
        """
        Build the frozen float plan snapshot blob (ADR-022 schema).
        Medical notes are excluded entirely.
        """
        trip = db.session.query(Trip).filter_by(id=UUID(trip_id)).first()
        if not trip:
            raise NoResultFound(f"Trip {trip_id} not found")

        logistics = db.session.query(Logistics).filter_by(trip_id=UUID(trip_id)).first()

        members = (
            db.session.query(TripMember)
            .filter_by(trip_id=UUID(trip_id))
            .options(joinedload(TripMember.user))
            .all()
        )

        crew = []
        for m in members:
            u = m.user
            full_name = u.name + (f" {u.surname}" if u.surname else "")
            crew.append({
                "name": full_name,
                "mail": u.mail,
                "role": m.role.value,
                "floatPlanConfirmedAt": m.float_plan_confirmed_at.isoformat() if m.float_plan_confirmed_at else None,
                "vessel": {
                    "make": m.vessel_make,
                    "model": m.vessel_model,
                    "lengthCm": m.vessel_length_cm,
                    "colorPrimary": m.vessel_color_primary,
                    "colorSecondary": m.vessel_color_secondary,
                },
                "emergencyContact": {
                    "name": m.emergency_contact_name,
                    "phone": m.emergency_contact_phone,
                    "relationship": m.emergency_contact_relationship,
                },
            })

        shore_contact = None
        if logistics:
            shore_contact = {
                "name": logistics.shore_contact_name,
                "email": logistics.shore_contact_email,
                "phone": logistics.shore_contact_phone,
                "relationship": logistics.shore_contact_relationship,
            }

        return {
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "trip": {
                "destination": trip.destination,
                "dateFrom": trip.date_from.isoformat() if trip.date_from else None,
                "dateTo": trip.date_to.isoformat() if trip.date_to else None,
            },
            "shoreContact": shore_contact,
            "crew": crew,
        }

    @staticmethod
    def generate_share(trip_id: str, user_id: str) -> Logistics:
        """
        Generate (or regenerate) the float plan share token and snapshot.
        Leader-only. Previous token is immediately invalidated.
        """
        trip = db.session.query(Trip).filter_by(id=UUID(trip_id)).first()
        if not trip:
            raise NoResultFound(f"Trip {trip_id} not found")

        membership = db.session.query(TripMember).filter_by(
            user_id=UUID(user_id), trip_id=UUID(trip_id)
        ).first()
        if not membership or membership.role != MemberRoleType.LEADER:
            raise PermissionError("Only the trip leader can generate the float plan link")

        logistics = db.session.query(Logistics).filter_by(trip_id=UUID(trip_id)).first()
        if logistics is None:
            logistics = Logistics(trip_id=UUID(trip_id))
            db.session.add(logistics)

        snapshot = LogisticsService.build_snapshot(trip_id)

        now = datetime.now(timezone.utc)
        if trip.date_to:
            date_to_aware = datetime(
                trip.date_to.year, trip.date_to.month, trip.date_to.day, tzinfo=timezone.utc
            )
            expires_at = max(date_to_aware, now) + timedelta(days=15)
        else:
            expires_at = now + timedelta(days=15)

        logistics.share_token = secrets.token_urlsafe(32)
        logistics.float_plan_snapshot = snapshot
        logistics.share_token_expires_at = expires_at

        db.session.commit()
        db.session.refresh(logistics)
        logger.info("float_plan_share_generated", extra={"trip_id": trip_id, "user_id": user_id})
        return logistics
