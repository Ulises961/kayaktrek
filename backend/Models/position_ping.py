from datetime import datetime
from typing import Optional, TYPE_CHECKING
from uuid import UUID as _UUID

from sqlalchemy import UUID, DateTime, Float, ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship

from Models.base_model import BaseModel

if TYPE_CHECKING:
    from Models.trip import Trip
    from Models.user import User


class PositionPing(BaseModel):
    """A single crew GPS ping during a `happening` expedition (M8 §D3)."""

    __tablename__ = "position_ping"
    __table_args__ = (
        Index("ix_position_ping_trip_user_recorded", "trip_id", "user_id", "recorded_at"),
    )

    trip_id: Mapped[_UUID] = mapped_column(
        UUID, ForeignKey("trip.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[_UUID] = mapped_column(
        UUID, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    lat: Mapped[float] = mapped_column(Float, nullable=False)
    lon: Mapped[float] = mapped_column(Float, nullable=False)
    accuracy_m: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    heading_deg: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    speed_ms: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    trip: Mapped["Trip"] = relationship("Trip", passive_deletes=True)
    user: Mapped["User"] = relationship("User", passive_deletes=True)

    def __repr__(self):
        return f'<PositionPing "trip {self.trip_id}, user {self.user_id}, {self.recorded_at}">'
