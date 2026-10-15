from datetime import datetime
from sqlalchemy import UUID, Boolean, DateTime, Integer, Numeric, ForeignKey, String, Float, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import List, Optional, TYPE_CHECKING
from uuid import UUID as _UUID
from Models.base_model import BaseModel
from Models.difficulty import DifficultyType, difficulty_enum

if TYPE_CHECKING:
    from Models.day import Day


class Itinerary(BaseModel):
    name: Mapped[str] = mapped_column(String(255), nullable=False, default='')
    # The route's public pitch. Lives here and not on Trip because the public shape
    # reads Itinerary with no trip data attached (ADR-012/026), so anything on Trip
    # cannot be published. Seeded from Trip.description on create and from the source
    # route on fork — a one-time copy, not a synced link.
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # How hard the route is: exposure, crossings, tidal races. Route-intrinsic, so it
    # is publishable and drives the /explore difficulty filter. Trip.difficulty is a
    # different judgement — the leader's call for one crew on one date.
    difficulty: Mapped[Optional[DifficultyType]] = mapped_column(
        difficulty_enum, nullable=True
    )
    is_public: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    avg_speed_knots: Mapped[float] = mapped_column(Float, nullable=False, default=2.5)
    total_miles: Mapped[Optional[Numeric]] = mapped_column(Numeric, nullable=True)
    expected_total_miles: Mapped[Optional[Numeric]] = mapped_column(Numeric, nullable=True)
    trip_id: Mapped[Optional[_UUID]] = mapped_column(UUID, ForeignKey("trip.id"), nullable=True, unique=True)
    user_id: Mapped[Optional[_UUID]] = mapped_column(UUID, ForeignKey("users.id", ondelete="CASCADE"), nullable=True)
    created_from_id: Mapped[Optional[_UUID]] = mapped_column(
        UUID, ForeignKey("itinerary.id", ondelete="SET NULL"), nullable=True
    )
    # Unlisted "share this trip's story" link, independent of is_public/explore discoverability.
    # Regenerating overwrites the old token, which is the only way to revoke it (as with
    # Logistics.share_token). No automatic expiry: a story is a keepsake, not a time-boxed
    # float plan.
    story_share_token: Mapped[Optional[str]] = mapped_column(String(64), unique=True, nullable=True)
    story_share_token_expires_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    # Route-level optimistic-concurrency token, bumped on every structural change
    # (point add/delete/reorder, day boundary move). Lets mobile sync-down detect a diverged
    # route as one version mismatch instead of diffing every point — see
    # docs/mobile/sync-protocol-spec.md §8.1.
    route_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    days: Mapped[List["Day"]] = relationship(
        lazy="select", cascade="all, delete,save-update"
    )

    def __repr__(self):
        return f'<Itinerary "{self.id}, {self.name}, {self.trip_id}">'
