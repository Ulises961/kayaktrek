from datetime import date as _date
from typing import Optional, TYPE_CHECKING
from uuid import UUID as _UUID

from sqlalchemy import Date, ForeignKey, String, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from Models.base_model import BaseModel

if TYPE_CHECKING:
    from Models.user import User


class UserCertification(BaseModel):
    __tablename__ = "user_certifications"

    user_id: Mapped[_UUID] = mapped_column(UUID, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    organization: Mapped[str] = mapped_column(String(100), nullable=False)
    award: Mapped[str] = mapped_column(String(200), nullable=False)
    membership_number: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    awarded_at: Mapped[Optional[_date]] = mapped_column(Date, nullable=True)
    valid_until: Mapped[Optional[_date]] = mapped_column(Date, nullable=True)

    user: Mapped["User"] = relationship("User", back_populates="certifications")

    def __repr__(self) -> str:
        return f"<UserCertification {self.organization} — {self.award} (user={self.user_id})>"
