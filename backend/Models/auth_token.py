import enum
from datetime import datetime
from uuid import UUID as _UUID

from sqlalchemy import UUID, Boolean, DateTime, Enum, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from Models.base_model import BaseModel


class AuthTokenType(enum.Enum):
    VERIFICATION = "verification"
    RESET = "reset"


class AuthToken(BaseModel):
    """
    Single-use time-limited token for email verification and password reset.

    The raw token is never stored — only a SHA-256 hex digest is persisted.
    The `used` flag is set to True immediately after the token is consumed
    so that re-use is rejected even before the token expires.
    """
    __tablename__ = "auth_token"

    user_id: Mapped[_UUID] = mapped_column(
        UUID, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    type: Mapped[AuthTokenType] = mapped_column(Enum(AuthTokenType), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    user = relationship("User", back_populates="auth_tokens")
