from typing import List
from uuid import UUID
import logging

from sqlalchemy.exc import NoResultFound

from Api.database import db
from Models.logistics import Logistics
from Models.shuttle_assignment import ShuttleAssignment, ShuttleRole
from Models.trip import Trip, TripStateType
from Models.trip_member import TripMember, MemberRoleType
from Schemas.base_schema import camelcase
from Schemas.shuttle_assignment_schema import ShuttleAssignmentSchema

logger = logging.getLogger(__name__)

_UPDATABLE_FIELDS = ("role", "vehicle_description", "pickup_point")


def _require_editable(trip: Trip) -> None:
    if trip.state in (TripStateType.PAST, TripStateType.ARCHIVED):
        raise ValueError("Shuttle assignments cannot be edited on a completed trip")


class ShuttleService:

    @staticmethod
    def list_for_trip(trip_id: str) -> List[ShuttleAssignment]:
        logistics = db.session.query(Logistics).filter_by(trip_id=UUID(trip_id)).first()
        if not logistics:
            return []
        return (
            db.session.query(ShuttleAssignment)
            .filter_by(logistics_id=logistics.id)
            .all()
        )

    @staticmethod
    def create(trip_id: str, data: dict, user_id: str) -> ShuttleAssignment:
        """
        Create a shuttle assignment. Any trip member can create one.
        Membership is pre-validated by the resource layer.

        Raises:
            NoResultFound: Trip or logistics not found
            ValueError: Trip is past/archived
        """
        trip = db.session.query(Trip).filter_by(id=UUID(trip_id)).first()
        if not trip:
            raise NoResultFound(f"Trip {trip_id} not found")
        _require_editable(trip)

        logistics = db.session.query(Logistics).filter_by(trip_id=UUID(trip_id)).first()
        if not logistics:
            raise NoResultFound(f"No logistics record exists for trip {trip_id} — create one first")

        assignment: ShuttleAssignment = ShuttleAssignmentSchema().load(data)
        assignment.logistics_id = logistics.id

        db.session.add(assignment)
        db.session.commit()
        db.session.refresh(assignment)
        logger.info("shuttle_assignment_created", extra={
            "trip_id": trip_id, "assignment_id": str(assignment.id), "user_id": user_id,
        })
        return assignment

    @staticmethod
    def update(assignment_id: str, data: dict, user_id: str) -> ShuttleAssignment:
        """
        Update a shuttle assignment. Membership is pre-validated by the resource layer.
        A crew member can only update their own row; the leader can update any.

        Raises:
            NoResultFound: Assignment not found
            PermissionError: Crew member tries to update another member's assignment
            ValueError: Trip is past/archived
        """
        assignment = db.session.query(ShuttleAssignment).filter_by(id=UUID(assignment_id)).first()
        if not assignment:
            raise NoResultFound(f"ShuttleAssignment {assignment_id} not found")

        logistics = db.session.query(Logistics).filter_by(id=assignment.logistics_id).first()
        _require_editable(logistics.trip)

        membership = db.session.query(TripMember).filter_by(
            user_id=UUID(user_id), trip_id=logistics.trip_id
        ).first()
        is_leader = membership.role == MemberRoleType.LEADER
        owns_row = assignment.trip_member_id == membership.id

        if not is_leader and not owns_row:
            raise PermissionError("Crew members can only update their own shuttle assignment")

        for field in _UPDATABLE_FIELDS:
            key = camelcase(field)
            if key in data:
                value = data[key]
                if field == "role":
                    value = ShuttleRole(value)
                setattr(assignment, field, value)

        db.session.commit()
        db.session.refresh(assignment)
        logger.info("shuttle_assignment_updated", extra={
            "assignment_id": assignment_id, "user_id": user_id,
        })
        return assignment

    @staticmethod
    def delete(assignment_id: str, user_id: str) -> None:
        """
        Delete a shuttle assignment. Membership is pre-validated by the resource layer.
        A crew member can only delete their own row; the leader can delete any.

        Raises:
            NoResultFound: Assignment not found
            PermissionError: Crew member tries to delete another member's assignment
            ValueError: Trip is past/archived
        """
        assignment = db.session.query(ShuttleAssignment).filter_by(id=UUID(assignment_id)).first()
        if not assignment:
            raise NoResultFound(f"ShuttleAssignment {assignment_id} not found")

        logistics = db.session.query(Logistics).filter_by(id=assignment.logistics_id).first()
        _require_editable(logistics.trip)

        membership = db.session.query(TripMember).filter_by(
            user_id=UUID(user_id), trip_id=logistics.trip_id
        ).first()
        is_leader = membership.role == MemberRoleType.LEADER
        owns_row = assignment.trip_member_id == membership.id

        if not is_leader and not owns_row:
            raise PermissionError("Crew members can only delete their own shuttle assignment")

        db.session.delete(assignment)
        db.session.commit()
        logger.info("shuttle_assignment_deleted", extra={
            "assignment_id": assignment_id, "user_id": user_id,
        })
