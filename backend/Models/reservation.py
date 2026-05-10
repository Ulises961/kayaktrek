import enum
from datetime import datew
from uuid import UUID as _UUID
from typing import Optional, TYPE_CHECKING

from sqlalchemy import UUID, Date, Enum, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from Models.base_model import BaseModel

if TYPE_CHECKING:
    from Models.trip import Trip
    from Models.user import User


class ReservationType(enum.Enum):
    ACCOMMODATION = "accommodation"
    TRANSPORT = "transport"
    PERMIT = "permit"
    OTHER = "other"


class Reservation(BaseModel):
    __tablename__ = "reservation"

    trip_id: Mapped[_UUID] = mapped_column(
        UUID, ForeignKey("trip.id", ondelete="CASCADE"), nullable=False, index=True
    )
    owner_id: Mapped[_UUID] = mapped_column(
        UUID, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )

    type: Mapped[ReservationType] = mapped_column(
        Enum(ReservationType, values_callable=lambda obj: [e.value for e in obj]),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(300), nullable=False)
    date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    confirmation_number: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    url: Mapped[Optional[str]] = mapped_column(String(2048), nullable=True)

    trip: Mapped["Trip"] = relationship(back_populates="reservations")
    owner: Mapped[Optional["User"]] = relationship("User")
