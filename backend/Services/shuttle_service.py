from typing import List
from uuid import UUID
import logging

from sqlalchemy.exc import NoResultFound

from Api.database import db
from Models.shuttle_passenger import ShuttlePassenger
from Models.shuttle_vehicle import ShuttleVehicle
from Models.trip import Trip, TripStateType
from Models.trip_member import TripMember, MemberRoleType
from Schemas.base_schema import camelcase
from Schemas.shuttle_vehicle_schema import ShuttleVehicleSchema

logger = logging.getLogger(__name__)

_VEHICLE_UPDATABLE_FIELDS = (
    "driver_id", "driver_name", "driver_contact",
    "seats_available", "kayak_spots", "vehicle_description", "pickup_point",
)


def _require_editable(trip: Trip) -> None:
    if trip.state in (TripStateType.PAST, TripStateType.ARCHIVED):
        raise ValueError("Shuttle cannot be edited on a completed trip")


def _require_arranger_or_leader(vehicle: ShuttleVehicle, user_id: str, trip_id) -> None:
    membership = db.session.query(TripMember).filter_by(
        user_id=UUID(user_id), trip_id=trip_id
    ).first()
    is_leader = membership.role == MemberRoleType.LEADER
    is_arranger = vehicle.arranged_by_id == membership.id
    if not is_leader and not is_arranger:
        raise PermissionError("Only the vehicle arranger or trip leader can modify this vehicle")


class ShuttleService:

    @staticmethod
    def list_for_trip(trip_id: str) -> List[ShuttleVehicle]:
        return (
            db.session.query(ShuttleVehicle)
            .filter_by(trip_id=UUID(trip_id))
            .all()
        )

    @staticmethod
    def create_vehicle(trip_id: str, data: dict, user_id: str) -> ShuttleVehicle:
        """
        Create a shuttle vehicle. The calling member becomes arranged_by.
        Membership is pre-validated by the resource layer.

        Raises:
            NoResultFound: Trip not found or user not a member
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

        vehicle: ShuttleVehicle = ShuttleVehicleSchema().load(data)
        vehicle.trip_id = UUID(trip_id)
        vehicle.arranged_by_id = membership.id

        db.session.add(vehicle)
        db.session.commit()
        db.session.refresh(vehicle)
        logger.info("shuttle_vehicle_created", extra={
            "trip_id": trip_id, "vehicle_id": str(vehicle.id), "user_id": user_id,
        })
        return vehicle

    @staticmethod
    def update_vehicle(vehicle_id: str, data: dict, user_id: str) -> ShuttleVehicle:
        """
        Update shuttle vehicle fields. Only the arranger or leader may update.
        Membership is pre-validated by the resource layer.

        Raises:
            NoResultFound: Vehicle not found
            PermissionError: User is neither arranger nor leader
            ValueError: Trip is past/archived
        """
        vehicle = db.session.query(ShuttleVehicle).filter_by(id=UUID(vehicle_id)).first()
        if not vehicle:
            raise NoResultFound(f"ShuttleVehicle {vehicle_id} not found")

        _require_editable(vehicle.trip)
        _require_arranger_or_leader(vehicle, user_id, vehicle.trip_id)

        for field in _VEHICLE_UPDATABLE_FIELDS:
            key = camelcase(field)
            if key in data:
                setattr(vehicle, field, data[key])

        db.session.commit()
        db.session.refresh(vehicle)
        logger.info("shuttle_vehicle_updated", extra={"vehicle_id": vehicle_id, "user_id": user_id})
        return vehicle

    @staticmethod
    def delete_vehicle(vehicle_id: str, user_id: str) -> None:
        """
        Delete a shuttle vehicle and all its passengers.
        Only the arranger or leader may delete.
        Membership is pre-validated by the resource layer.

        Raises:
            NoResultFound: Vehicle not found
            PermissionError: User is neither arranger nor leader
            ValueError: Trip is past/archived
        """
        vehicle = db.session.query(ShuttleVehicle).filter_by(id=UUID(vehicle_id)).first()
        if not vehicle:
            raise NoResultFound(f"ShuttleVehicle {vehicle_id} not found")

        _require_editable(vehicle.trip)
        _require_arranger_or_leader(vehicle, user_id, vehicle.trip_id)

        db.session.delete(vehicle)
        db.session.commit()
        logger.info("shuttle_vehicle_deleted", extra={"vehicle_id": vehicle_id, "user_id": user_id})

    @staticmethod
    def add_passenger(vehicle_id: str, member_id: str, user_id: str) -> ShuttlePassenger:
        """
        Add a trip member as a passenger in a vehicle.
        Any trip member may add themselves; the arranger or leader may add anyone.
        Membership is pre-validated by the resource layer.

        Raises:
            NoResultFound: Vehicle or member not found
            PermissionError: Crew member trying to add someone else
            ValueError: Trip is past/archived or member already assigned to this vehicle
        """
        vehicle = db.session.query(ShuttleVehicle).filter_by(id=UUID(vehicle_id)).first()
        if not vehicle:
            raise NoResultFound(f"ShuttleVehicle {vehicle_id} not found")

        _require_editable(vehicle.trip)

        acting_member = db.session.query(TripMember).filter_by(
            user_id=UUID(user_id), trip_id=vehicle.trip_id
        ).first()
        is_leader = acting_member.role == MemberRoleType.LEADER
        is_arranger = vehicle.arranged_by_id == acting_member.id
        adding_self = acting_member.id == UUID(member_id)

        if not is_leader and not is_arranger and not adding_self:
            raise PermissionError("Crew members can only add themselves as passengers")

        target_member = db.session.query(TripMember).filter_by(
            id=UUID(member_id), trip_id=vehicle.trip_id
        ).first()
        if not target_member:
            raise NoResultFound(f"TripMember {member_id} not found on this trip")

        existing = db.session.query(ShuttlePassenger).filter_by(
            vehicle_id=UUID(vehicle_id), trip_member_id=UUID(member_id)
        ).first()
        if existing:
            raise ValueError("This member is already assigned to this vehicle")

        passenger = ShuttlePassenger(
            vehicle_id=UUID(vehicle_id),
            trip_member_id=UUID(member_id),
        )
        db.session.add(passenger)
        db.session.commit()
        db.session.refresh(passenger)
        logger.info("shuttle_passenger_added", extra={
            "vehicle_id": vehicle_id, "member_id": member_id, "user_id": user_id,
        })
        return passenger

    @staticmethod
    def remove_passenger(vehicle_id: str, member_id: str, user_id: str) -> None:
        """
        Remove a passenger from a vehicle.
        Any trip member may remove themselves; the arranger or leader may remove anyone.
        Membership is pre-validated by the resource layer.

        Raises:
            NoResultFound: Vehicle or passenger row not found
            PermissionError: Crew member trying to remove someone else
            ValueError: Trip is past/archived
        """
        vehicle = db.session.query(ShuttleVehicle).filter_by(id=UUID(vehicle_id)).first()
        if not vehicle:
            raise NoResultFound(f"ShuttleVehicle {vehicle_id} not found")

        _require_editable(vehicle.trip)

        acting_member = db.session.query(TripMember).filter_by(
            user_id=UUID(user_id), trip_id=vehicle.trip_id
        ).first()
        is_leader = acting_member.role == MemberRoleType.LEADER
        is_arranger = vehicle.arranged_by_id == acting_member.id
        removing_self = acting_member.id == UUID(member_id)

        if not is_leader and not is_arranger and not removing_self:
            raise PermissionError("Crew members can only remove themselves from a vehicle")

        passenger = db.session.query(ShuttlePassenger).filter_by(
            vehicle_id=UUID(vehicle_id), trip_member_id=UUID(member_id)
        ).first()
        if not passenger:
            raise NoResultFound(f"Member {member_id} is not a passenger in vehicle {vehicle_id}")

        db.session.delete(passenger)
        db.session.commit()
        logger.info("shuttle_passenger_removed", extra={
            "vehicle_id": vehicle_id, "member_id": member_id, "user_id": user_id,
        })
