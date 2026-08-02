from datetime import datetime, timezone
from typing import Optional
from uuid import UUID as _UUID

from sqlalchemy import UUID, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from Models.base_model import BaseModel


class Session(BaseModel):
    """
    One device's refresh-token chain (M17).

    The row id is the `sid` claim carried by every access and refresh token issued to
    this device, which is what makes revocation family-scoped: revoking one session
    leaves the user's other devices signed in. `token_version` is the per-session
    rotation counter — a refresh token presenting a stale value was already exchanged
    once, which is the reuse signal.

    Access tokens stay stateless (no DB read per request); the row is read on refresh,
    roughly once per access-token lifetime per device.
    """
    __tablename__ = "session"

    user_id: Mapped[_UUID] = mapped_column(
        UUID, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    token_version: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    last_used_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc)
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    # Coarse, derived from the User-Agent at write time ("iPhone", "Firefox on Linux") —
    # never the raw UA string.
    device_label: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    # Approximate origin ("Genoa, Italy") resolved from trusted proxy headers at write
    # time. The address itself is never persisted.
    location_label: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)

    user = relationship("User", back_populates="sessions")

    # Set per-request by the sessions resource so the list can mark the caller's own
    # device. Unannotated on purpose — SQLAlchemy only maps annotated attributes, and
    # this one is never persisted.
    is_current = False

    @property
    def is_usable(self) -> bool:
        """True while this session may still exchange a refresh token."""
        if self.revoked_at is not None:
            return False
        expires_at = (
            self.expires_at.astimezone(timezone.utc)
            if self.expires_at.tzinfo is not None
            else self.expires_at.replace(tzinfo=timezone.utc)
        )
        return expires_at > datetime.now(timezone.utc)
