import enum
from datetime import datetime
from uuid import UUID as _UUID
from typing import Optional, TYPE_CHECKING

from sqlalchemy import UUID, ForeignKey, Enum, UniqueConstraint, CheckConstraint, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship

from Models.base_model import BaseModel

if TYPE_CHECKING:
    from Models.user import User


class ConnectionStatusType(enum.Enum):
    PENDING = "pending"
    ACCEPTED = "accepted"


class Connection(BaseModel):
    """Symmetric buddy connection, stored as a directed request that flips to accepted.

    One row per pair: a mirror duplicate (B->A when A->B exists) is rejected in the
    service on create. Accepted rows mean the two users are buddies; membership queries
    union both columns. A declined pending request is deleted (re-requestable), not
    stored as a terminal state.
    """

    __tablename__ = "connection"
    __table_args__ = (
        UniqueConstraint("requester_id", "addressee_id", name="uq_connection_pair"),
        CheckConstraint("requester_id <> addressee_id", name="ck_connection_not_self"),
    )

    requester_id: Mapped[_UUID] = mapped_column(
        UUID, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    addressee_id: Mapped[_UUID] = mapped_column(
        UUID, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    status: Mapped[ConnectionStatusType] = mapped_column(
        Enum(ConnectionStatusType, values_callable=lambda obj: [e.value for e in obj]),
        nullable=False,
        default=ConnectionStatusType.PENDING,
    )
    responded_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    requester: Mapped["User"] = relationship(
        "User", foreign_keys=[requester_id], passive_deletes=True
    )
    addressee: Mapped["User"] = relationship(
        "User", foreign_keys=[addressee_id], passive_deletes=True
    )
