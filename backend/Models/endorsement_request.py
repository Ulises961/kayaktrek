import enum
from datetime import datetime
from uuid import UUID as _UUID
from typing import Optional, TYPE_CHECKING

from sqlalchemy import UUID, ForeignKey, Enum, UniqueConstraint, CheckConstraint, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship

from Models.base_model import BaseModel

if TYPE_CHECKING:
    from Models.user import User
    from Models.log import Log


class EndorsementRequestStatusType(enum.Enum):
    PENDING = "pending"
    ACTIONED = "actioned"


class EndorsementRequest(BaseModel):
    """An author's targeted ask to a trip-mate to endorse one of their logs.

    The author opens their own trip-linked log and asks a fellow trip member to
    endorse it. The addressee acts with the existing POST /log/<id>/endorse, which
    resolves the matching pending request to `actioned`. Eligibility mirrors the
    endorse rule (author-only, trip-linked log, addressee is a trip member, not self,
    no block either direction).
    """

    __tablename__ = "endorsement_request"
    __table_args__ = (
        UniqueConstraint("log_id", "addressee_id", name="uq_endorsement_request_log_addressee"),
        CheckConstraint("requester_id <> addressee_id", name="ck_endorsement_request_not_self"),
    )

    log_id: Mapped[_UUID] = mapped_column(
        UUID, ForeignKey("log.id", ondelete="CASCADE"), nullable=False, index=True
    )
    requester_id: Mapped[_UUID] = mapped_column(
        UUID, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    addressee_id: Mapped[_UUID] = mapped_column(
        UUID, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    status: Mapped[EndorsementRequestStatusType] = mapped_column(
        Enum(
            EndorsementRequestStatusType,
            values_callable=lambda obj: [e.value for e in obj],
        ),
        nullable=False,
        default=EndorsementRequestStatusType.PENDING,
    )
    responded_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    log: Mapped["Log"] = relationship("Log", passive_deletes=True)
    requester: Mapped["User"] = relationship(
        "User", foreign_keys=[requester_id], passive_deletes=True
    )
    addressee: Mapped["User"] = relationship(
        "User", foreign_keys=[addressee_id], passive_deletes=True
    )
