import uuid
from datetime import date
from typing import TYPE_CHECKING

from sqlalchemy import Date, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from Models.base_model import BaseModel

if TYPE_CHECKING:
    from Models.user import User
    from Models.trip import Trip


class Invitation(BaseModel):
    __tablename__ = 'invitation'
    __table_args__ = (
        UniqueConstraint('user_id', 'trip_id', name='uq_invitation_user_trip'),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey('users.id', ondelete='CASCADE'), nullable=False
    )
    trip_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey('trip.id', ondelete='CASCADE'), nullable=False
    )
    expires_at: Mapped[date] = mapped_column(Date, nullable=False)

    user: Mapped["User"] = relationship("User", back_populates="received_invitations")
    trip: Mapped["Trip"] = relationship("Trip", back_populates="invitations")

    @property
    def is_expired(self) -> bool:
        return self.expires_at < date.today()
