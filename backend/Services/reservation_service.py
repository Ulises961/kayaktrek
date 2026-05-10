from datetime import date
from typing import List
from uuid import UUID
import logging

from sqlalchemy.exc import NoResultFound

from Api.database import db
from Models.reservation import Reservation, ReservationType
from Models.trip import Trip
from Models.trip_member import TripMember, MemberRoleType
from Schemas.base_schema import camelcase
from Schemas.reservation_schema import ReservationSchema

logger = logging.getLogger(__name__)

_UPDATABLE_FIELDS = ("type", "name", "date", "confirmation_number", "notes", "url")


def _require_editable_by_date(item_date) -> None:
    if item_date is not None and item_date < date.today():
        raise ValueError("This reservation's date has passed and can no longer be edited")


class ReservationService:

    @staticmethod
    def list_for_trip(trip_id: str) -> List[Reservation]:
        return (
            db.session.query(Reservation)
            .filter_by(trip_id=UUID(trip_id))
            .order_by(Reservation.date.asc().nullslast())
            .all()
        )

    @staticmethod
    def create(trip_id: str, data: dict, user_id: str) -> Reservation:
        """
        Create a reservation. Any trip member can create; the creator becomes owner.
        Membership is pre-validated by the resource layer.

        Raises:
            NoResultFound: Trip not found
        """
        if not db.session.query(Trip).filter_by(id=UUID(trip_id)).first():
            raise NoResultFound(f"Trip {trip_id} not found")

        reservation: Reservation = ReservationSchema().load(data)
        reservation.trip_id = UUID(trip_id)
        reservation.owner_id = UUID(user_id)

        db.session.add(reservation)
        db.session.commit()
        db.session.refresh(reservation)
        logger.info("reservation_created", extra={
            "trip_id": trip_id, "reservation_id": str(reservation.id), "user_id": user_id,
        })
        return reservation

    @staticmethod
    def update(reservation_id: str, data: dict, user_id: str) -> Reservation:
        """
        Partially update a reservation. Membership is pre-validated by the resource layer.
        Only the owner or trip leader may update; record must not be past its date.

        Raises:
            NoResultFound: Reservation not found
            PermissionError: User is neither owner nor leader
            ValueError: Reservation date has passed
        """
        reservation = db.session.query(Reservation).filter_by(id=UUID(reservation_id)).first()
        if not reservation:
            raise NoResultFound(f"Reservation {reservation_id} not found")

        _require_editable_by_date(reservation.date)

        membership = db.session.query(TripMember).filter_by(
            user_id=UUID(user_id), trip_id=reservation.trip_id
        ).first()
        if membership.role != MemberRoleType.LEADER and reservation.owner_id != UUID(user_id):
            raise PermissionError("Only the reservation owner or trip leader can update this")

        for field in _UPDATABLE_FIELDS:
            key = camelcase(field)
            if key in data:
                value = data[key]
                if field == "type":
                    value = ReservationType(value)
                setattr(reservation, field, value)

        db.session.commit()
        db.session.refresh(reservation)
        logger.info("reservation_updated", extra={
            "reservation_id": reservation_id, "user_id": user_id,
        })
        return reservation

    @staticmethod
    def delete(reservation_id: str, user_id: str) -> None:
        """
        Delete a reservation. Membership is pre-validated by the resource layer.
        Only the owner or trip leader may delete; record must not be past its date.

        Raises:
            NoResultFound: Reservation not found
            PermissionError: User is neither owner nor leader
            ValueError: Reservation date has passed
        """
        reservation = db.session.query(Reservation).filter_by(id=UUID(reservation_id)).first()
        if not reservation:
            raise NoResultFound(f"Reservation {reservation_id} not found")

        _require_editable_by_date(reservation.date)

        membership = db.session.query(TripMember).filter_by(
            user_id=UUID(user_id), trip_id=reservation.trip_id
        ).first()
        if membership.role != MemberRoleType.LEADER and reservation.owner_id != UUID(user_id):
            raise PermissionError("Only the reservation owner or trip leader can delete this")

        db.session.delete(reservation)
        db.session.commit()
        logger.info("reservation_deleted", extra={
            "reservation_id": reservation_id, "user_id": user_id,
        })
