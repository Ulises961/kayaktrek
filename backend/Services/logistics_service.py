from typing import Optional
from uuid import UUID
import logging

from sqlalchemy.exc import NoResultFound

from Api.database import db
from Models.logistics import Logistics
from Models.trip import Trip, TripStateType
from Models.trip_member import TripMember, MemberRoleType
from Schemas.base_schema import camelcase

logger = logging.getLogger(__name__)

_LEADER_FIELDS = frozenset({
    "departure_point", "arrival_point", "travel_notes",
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

        Leader-only fields (departure_point, arrival_point, shore_contact_*,
        travel_notes) raise PermissionError if a crew member tries to set them.
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
