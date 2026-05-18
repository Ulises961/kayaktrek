from datetime import datetime
from uuid import UUID as _UUID
from typing import Optional, TYPE_CHECKING

from sqlalchemy import UUID, DateTime, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from Models.base_model import BaseModel

if TYPE_CHECKING:
    from Models.trip import Trip


class Logistics(BaseModel):
    __tablename__ = "logistics"
    __table_args__ = (
        UniqueConstraint("trip_id", name="uq_logistics_trip"),
    )

    trip_id: Mapped[_UUID] = mapped_column(
        UUID, ForeignKey("trip.id", ondelete="CASCADE"), nullable=False
    )

    shore_contact_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    shore_contact_email: Mapped[Optional[str]] = mapped_column(String(254), nullable=True)
    shore_contact_phone: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    shore_contact_relationship: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    # Shuttle coordination — when/where everyone meets before executing the car shuffle.
    # Per-member assignments (who drives which car) are in ShuttleAssignment.
    shuttle_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    shuttle_meeting_time: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)

    share_token: Mapped[Optional[str]] = mapped_column(String(64), unique=True, nullable=True)
    float_plan_snapshot: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    share_token_expires_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    trip: Mapped["Trip"] = relationship(back_populates="logistics")
