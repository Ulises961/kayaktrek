from datetime import datetime
from typing import Optional
from uuid import UUID as _UUID

from sqlalchemy import UUID, Boolean, DateTime, Enum, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from Models.base_model import BaseModel
from Services.SatelliteFeeds.types import SatelliteProvider


class SatelliteFeed(BaseModel):
    """A user-registered satellite communicator feed — Garmin inReach MapShare is the
    only provider so far (`SatelliteProvider`). Not trip-scoped: this is a profile-level setting,
    like a saved feed URL. The Celery beat task resolves which HAPPENING trip(s) to
    record into at poll time (Tasks/satellite_feed_beat_task.py), the same way a phone
    GPS ping is trip-scoped only once it reaches LivePositionService.

    `feed_password` is stored server-key-encrypted at rest
    (Services/Utils/server_secret_crypto.py) — the opposite trust model from the
    medical-notes ECIES scheme, since the beat task must decrypt it unattended, with
    no user present to supply a passphrase.
    """

    __tablename__ = "satellite_feed"
    __table_args__ = (
        UniqueConstraint("user_id", "provider", name="uq_satellite_feed_user_provider"),
    )

    user_id: Mapped[_UUID] = mapped_column(
        UUID, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    provider: Mapped[SatelliteProvider] = mapped_column(
        Enum(SatelliteProvider, values_callable=lambda obj: [e.value for e in obj]),
        nullable=False,
    )
    feed_url: Mapped[str] = mapped_column(String(500), nullable=False)

    # MapShare's optional password protection. Username isn't sensitive (Garmin has no
    # username concept — this is reserved for a future provider that does); the
    # password is encrypted, never stored plain.
    feed_username: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    feed_password_ciphertext: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    feed_password_nonce: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    last_polled_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    # Timestamp of the newest position this feed has ingested — the dedup boundary
    # passed as `since` to SatelliteFeedSource.build_request/parse, not the same as
    # last_polled_at (a poll that fetched successfully but found zero new points still
    # advances last_polled_at, but must not move this field backward or lose it).
    last_ingested_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    # Set when the provider rejects stored credentials (401/403) or a time-limited
    # share link expires — the fix is re-entering the feed URL/credentials, not a
    # retry, so the beat task stops polling this feed until the user acts.
    needs_reauth: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")

    user = relationship("User", back_populates="satellite_feeds")
