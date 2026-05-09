import enum
from datetime import datetime
from uuid import UUID as _UUID
from sqlalchemy import UUID, ForeignKey, Enum, UniqueConstraint, String, Integer, Text, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship
from Models.base_model import BaseModel
from typing import Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from Models.user import User
    from Models.trip import Trip


class MemberRoleType(enum.Enum):
    LEADER = "leader"
    CREW = "crew"


class TripMember(BaseModel):
    __tablename__ = "trip_member"
    __table_args__ = (
        UniqueConstraint('user_id', 'trip_id', name='uq_trip_member_user_trip'),
    )

    user_id: Mapped[_UUID] = mapped_column(UUID, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    trip_id: Mapped[_UUID] = mapped_column(UUID, ForeignKey("trip.id", ondelete="CASCADE"), nullable=False, index=True)
    role: Mapped[MemberRoleType] = mapped_column(
        Enum(MemberRoleType, values_callable=lambda obj: [e.value for e in obj]),
        nullable=False,
    )

    # Vessel — snapshot at time of joining; editable independently of User profile defaults
    vessel_make: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    vessel_model: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    vessel_length_cm: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    vessel_color_primary: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    vessel_color_secondary: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    # Emergency contact — snapshot
    emergency_contact_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    emergency_contact_phone: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    emergency_contact_relationship: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    # Populated when user confirms float plan: server decrypts User.medical_notes in memory
    # (using re-auth password) and stores plaintext here under server-side AES-GCM.
    # User explicitly acknowledges sharing with the trip leader at confirmation time.
    # Nulled cascade when user revokes medical consent on their User record.
    medical_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    medical_notes_consent_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    # Set on any successful PATCH to this member's float plan fields
    float_plan_confirmed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped["User"] = relationship(back_populates="trip_memberships", passive_deletes=True)
    trip: Mapped["Trip"] = relationship(back_populates="trip_members", passive_deletes=True)
