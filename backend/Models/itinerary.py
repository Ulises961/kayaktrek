from datetime import datetime
from sqlalchemy import UUID, Boolean, DateTime, Numeric, ForeignKey, String, Float
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import List, Optional, TYPE_CHECKING
from uuid import UUID as _UUID
from Models.base_model import BaseModel

if TYPE_CHECKING:
    from Models.day import Day


class Itinerary(BaseModel):
    name: Mapped[str] = mapped_column(String(255), nullable=False, default='')
    is_public: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    avg_speed_knots: Mapped[float] = mapped_column(Float, nullable=False, default=2.5)
    total_miles: Mapped[Optional[Numeric]] = mapped_column(Numeric, nullable=True)
    expected_total_miles: Mapped[Optional[Numeric]] = mapped_column(Numeric, nullable=True)
    trip_id: Mapped[Optional[_UUID]] = mapped_column(UUID, ForeignKey("trip.id"), nullable=True, unique=True)
    user_id: Mapped[Optional[_UUID]] = mapped_column(UUID, ForeignKey("users.id", ondelete="CASCADE"), nullable=True)
    created_from_id: Mapped[Optional[_UUID]] = mapped_column(
        UUID, ForeignKey("itinerary.id", ondelete="SET NULL"), nullable=True
    )
    # Unlisted "share this trip's story" link (M7d) — independent of is_public/explore
    # discoverability. Regenerating overwrites the old token, which is the only revoke
    # path (mirrors Logistics.share_token). No automatic expiry: a story is a keepsake,
    # not a time-boxed float plan.
    story_share_token: Mapped[Optional[str]] = mapped_column(String(64), unique=True, nullable=True)
    story_share_token_expires_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    days: Mapped[List["Day"]] = relationship(
        lazy="select", cascade="all, delete,save-update"
    )

    def __repr__(self):
        return f'<Itinerary "{self.id}, {self.name}, {self.trip_id}">'
