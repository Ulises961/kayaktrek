import enum
from datetime import datetime
from typing import Optional
from uuid import UUID as _UUID

from sqlalchemy import UUID, DateTime, Enum, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from Models.base_model import BaseModel


class NotificationKind(enum.Enum):
    TRIP_INVITATION_ACCEPTED = "trip_invitation_accepted"
    BUDDY_REQUEST_ACCEPTED = "buddy_request_accepted"


class Notification(BaseModel):
    """Something that happened to a request a user sent, for them to see in the bell.

    A trip invitation disappears when it is answered and a buddy request only changes status,
    so neither leaves anything for the sender to be told about. This is that record. It is read
    through the pending-requests summary as one count per kind and cleared by kind; it is kept
    (stamped with `read_at`) rather than deleted, so the history stays inspectable.
    """

    __tablename__ = "notification"

    # Who is told.
    user_id: Mapped[_UUID] = mapped_column(
        UUID, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    kind: Mapped[NotificationKind] = mapped_column(
        Enum(NotificationKind, values_callable=lambda obj: [e.value for e in obj]),
        nullable=False,
    )
    # Who did it (the invitee who accepted, the paddler who accepted the buddy request).
    actor_id: Mapped[_UUID] = mapped_column(
        UUID, ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    trip_id: Mapped[Optional[_UUID]] = mapped_column(
        UUID, ForeignKey("trip.id", ondelete="CASCADE"), nullable=True
    )
    read_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
