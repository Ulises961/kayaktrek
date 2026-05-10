import enum
from datetime import date
from uuid import UUID as _UUID
from typing import Optional, TYPE_CHECKING

from sqlalchemy import UUID, Date, Enum, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from Models.base_model import BaseModel

if TYPE_CHECKING:
    from Models.trip import Trip
    from Models.user import User


class DocumentType(enum.Enum):
    PERMIT = "permit"
    LICENCE = "licence"
    INSURANCE = "insurance"
    OTHER = "other"


class Document(BaseModel):
    __tablename__ = "document"

    trip_id: Mapped[_UUID] = mapped_column(
        UUID, ForeignKey("trip.id", ondelete="CASCADE"), nullable=False, index=True
    )
    owner_id: Mapped[_UUID] = mapped_column(
        UUID, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )

    type: Mapped[DocumentType] = mapped_column(
        Enum(DocumentType, values_callable=lambda obj: [e.value for e in obj]),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(300), nullable=False)
    expiry_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    trip: Mapped["Trip"] = relationship(back_populates="documents")
    owner: Mapped[Optional["User"]] = relationship("User")
