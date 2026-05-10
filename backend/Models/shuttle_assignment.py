import enum
from uuid import UUID as _UUID
from typing import Optional, TYPE_CHECKING

from sqlalchemy import UUID, Enum, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from Models.base_model import BaseModel

if TYPE_CHECKING:
    from Models.logistics import Logistics
    from Models.trip_member import TripMember


class ShuttleRole(enum.Enum):
    DRIVER = "driver"
    PASSENGER = "passenger"


class ShuttleAssignment(BaseModel):
    __tablename__ = "shuttle_assignment"

    logistics_id: Mapped[_UUID] = mapped_column(
        UUID, ForeignKey("logistics.id", ondelete="CASCADE"), nullable=False, index=True
    )
    trip_member_id: Mapped[_UUID] = mapped_column(
        UUID, ForeignKey("trip_member.id", ondelete="CASCADE"), nullable=False, index=True
    )

    role: Mapped[ShuttleRole] = mapped_column(
        Enum(ShuttleRole, values_callable=lambda obj: [e.value for e in obj]),
        nullable=False,
    )
    vehicle_description: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    pickup_point: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    logistics: Mapped["Logistics"] = relationship(back_populates="shuttle_assignments")
    trip_member: Mapped["TripMember"] = relationship("TripMember")
