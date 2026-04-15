import enum
from uuid import UUID as _UUID
from sqlalchemy import UUID, ForeignKey, Enum
from sqlalchemy.orm import Mapped, mapped_column, relationship
from Api.database import db
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from Models.user import User
    from Models.trip import Trip


class MemberRoleType(enum.Enum):
    LEADER = "leader"
    CREW = "crew"


class TripMember(db.Model):
    __tablename__ = "trip_member"

    user_id: Mapped[_UUID] = mapped_column(UUID, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    trip_id: Mapped[_UUID] = mapped_column(UUID, ForeignKey("trip.id", ondelete="CASCADE"), primary_key=True)
    role: Mapped[MemberRoleType] = mapped_column(Enum(MemberRoleType), nullable=False)

    user: Mapped["User"] = relationship(back_populates="trip_memberships", passive_deletes=True)
    trip: Mapped["Trip"] = relationship(back_populates="trip_members", passive_deletes=True)
