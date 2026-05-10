from uuid import UUID as _UUID
from typing import TYPE_CHECKING

from sqlalchemy import UUID, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from Models.base_model import BaseModel

if TYPE_CHECKING:
    from Models.shuttle_vehicle import ShuttleVehicle
    from Models.trip_member import TripMember


class ShuttlePassenger(BaseModel):
    __tablename__ = "shuttle_passenger"
    __table_args__ = (
        UniqueConstraint("vehicle_id", "trip_member_id", name="uq_shuttle_passenger_member"),
    )

    vehicle_id: Mapped[_UUID] = mapped_column(
        UUID, ForeignKey("shuttle_vehicle.id", ondelete="CASCADE"), nullable=False, index=True
    )
    trip_member_id: Mapped[_UUID] = mapped_column(
        UUID, ForeignKey("trip_member.id", ondelete="CASCADE"), nullable=False, index=True
    )

    vehicle: Mapped["ShuttleVehicle"] = relationship(back_populates="passengers")
    trip_member: Mapped["TripMember"] = relationship("TripMember")
