from uuid import UUID as _UUID
from typing import Optional, List, TYPE_CHECKING

from sqlalchemy import UUID, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from Models.base_model import BaseModel

if TYPE_CHECKING:
    from Models.trip import Trip
    from Models.trip_member import TripMember
    from Models.shuttle_passenger import ShuttlePassenger


class ShuttleVehicle(BaseModel):
    __tablename__ = "shuttle_vehicle"

    trip_id: Mapped[_UUID] = mapped_column(
        UUID, ForeignKey("trip.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # Non-null at the application level; SET NULL on DB cascade so GDPR deletions
    # do not violate the FK — the service transfers ownership before member removal.
    arranged_by_id: Mapped[Optional[_UUID]] = mapped_column(
        UUID, ForeignKey("trip_member.id", ondelete="SET NULL"), nullable=True, index=True
    )
    driver_id: Mapped[Optional[_UUID]] = mapped_column(
        UUID, ForeignKey("trip_member.id", ondelete="SET NULL"), nullable=True, index=True
    )

    driver_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    driver_contact: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    seats_available: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    kayak_spots: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    vehicle_description: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    pickup_point: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    trip: Mapped["Trip"] = relationship(back_populates="shuttle_vehicles")
    arranged_by: Mapped[Optional["TripMember"]] = relationship(
        "TripMember", foreign_keys=[arranged_by_id]
    )
    driver: Mapped[Optional["TripMember"]] = relationship(
        "TripMember", foreign_keys=[driver_id]
    )
    passengers: Mapped[List["ShuttlePassenger"]] = relationship(
        "ShuttlePassenger",
        back_populates="vehicle",
        cascade="all, delete-orphan",
    )
