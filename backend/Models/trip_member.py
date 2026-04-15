import enum
from uuid import UUID as _UUID
from sqlalchemy import UUID, ForeignKey, Enum, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from Models.base_model import BaseModel
from typing import TYPE_CHECKING

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
    trip_id: Mapped[_UUID] = mapped_column(UUID, ForeignKey("trip.id", ondelete="CASCADE"), nullable=False)
    role: Mapped[MemberRoleType] = mapped_column(Enum(MemberRoleType), nullable=False)

    user: Mapped["User"] = relationship(back_populates="trip_memberships", passive_deletes=True)
    trip: Mapped["Trip"] = relationship(back_populates="trip_members", passive_deletes=True)
