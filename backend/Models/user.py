
from flask_bcrypt import generate_password_hash
from Models.base_model import BaseModel
from Models.inventory import Inventory
from Models.item import Item
from Models.itinerary import Itinerary
from Models.user_has_itinerary import user_has_itinerary
from Models.user_has_inventory import user_has_inventory
from Models.user_has_items import user_has_items
from Models.trip_member import TripMember
from Models.user_endorses_log import user_endorses_log
from Models.connection import Connection
from Models.block import Block
from datetime import datetime
from sqlalchemy import String, Boolean, Integer, Text, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import List, Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from Models.log import Log
    from Models.trip import Trip
    from Models.auth_token import AuthToken
    from Models.invitation import Invitation
    from Models.user_certification import UserCertification


class User(BaseModel):
    __tablename__ = "users"

    def __init__(self, pwd=None, endorsed_logs=None, logs=None, id=None, **kwargs):
        if pwd:
            self.pwd = generate_password_hash(pwd).decode("UTF-8")

        self.endorsed_logs = endorsed_logs if endorsed_logs is not None else []
        self.logs = logs if logs is not None else []

        for key, value in kwargs.items():
            setattr(self, key, value)

    mail: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    pwd: Mapped[str] = mapped_column(String(255), nullable=False)
    phone: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    username: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    surname: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    avatar_url: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    admin: Mapped[bool] = mapped_column(Boolean, default=False)
    active: Mapped[bool] = mapped_column(Boolean, default=False)

    # Public profile (M7a) — opt-in, privacy-first. profile_is_public gates the entire
    # public projection (stats + certifications); bio and home_location are free text.
    bio: Mapped[Optional[str]] = mapped_column(String(1000), nullable=True)
    home_location: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    profile_is_public: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )

    # Vessel defaults — pre-fill TripMember on invitation acceptance
    vessel_make: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    vessel_model: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    vessel_length_cm: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    vessel_color_primary: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    vessel_color_secondary: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    # Emergency contact defaults
    emergency_contact_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    emergency_contact_phone: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    emergency_contact_relationship: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    # Encrypted at rest with a user-derived key (PBKDF2-HMAC-SHA256 → AES-256-GCM).
    # Server never stores the plaintext or the derived key — only ciphertext, nonce, and salt.
    # Re-auth (password) is the decryption instrument. Requires prior consent to save.
    # When the user confirms their float plan for a trip, the server derives the key from
    # the re-auth password, decrypts in memory, and copies plaintext to TripMember
    # (server-side AES-GCM from that point — user has explicitly shared it).
    # Revoking consent nulls both this record and all TripMember rows for this user.
    medical_notes_ciphertext: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    medical_notes_nonce: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    medical_notes_salt: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    medical_notes_consent_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    # Set when a forgot-password reset wiped the user's medical notes (the wrapping key is
    # derived from the old password and cannot be recovered). Drives a one-time "re-enter
    # your medical notes" prompt in the UI; cleared once the user grants consent again.
    medical_notes_reset_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    # X25519 keypair — public key stored in plaintext; private key AES-GCM encrypted with
    # the user's password (same PBKDF2+AES-GCM pattern as medical_notes_ciphertext).
    # Generated at registration. Used to encrypt TripMember leader-visible medical notes
    # so they are never stored as plaintext in the DB. See ADR-023.
    public_key: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    private_key_ciphertext: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    private_key_nonce: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    private_key_salt: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)

    # GDPR: erasure grace period — set on deletion request, hard-deleted after 30 days
    deletion_requested_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    # Token revocation: tokens issued before this timestamp are rejected.
    # Stamped on every password change so stolen access tokens cannot outlive the window.
    password_changed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    # Monotonic counter embedded in every issued token. Incrementing it instantly
    # invalidates all outstanding access and refresh tokens (password change, explicit
    # logout, account deletion request). Checked on every authenticated request.
    token_version: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")

    # Rotation counter for refresh tokens specifically — separate from token_version (the
    # full-session kill switch for password change/logout/theft). Bumped on every successful
    # /auth/refresh. A refresh token presented with a stale value indicates reuse (the token
    # was already exchanged once, e.g. stolen and replayed), which additionally bumps
    # token_version to revoke every outstanding session. See ADR-032 / M11 §2.
    refresh_token_version: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")

    # Association object: full role-aware access
    trip_memberships: Mapped[List["TripMember"]] = relationship(
        "TripMember",
        back_populates="user",
        cascade="all, delete-orphan",
    )
    # Viewonly convenience relationship — use trip_memberships for mutations
    trips: Mapped[List["Trip"]] = relationship(
        secondary="trip_member", viewonly=True
    )
    received_invitations: Mapped[List["Invitation"]] = relationship(
        "Invitation",
        back_populates="user",
        cascade="all, delete-orphan",
    )
    endorsed_logs: Mapped[List["Log"]] = relationship(
        secondary=user_endorses_log, back_populates="user_endorsed_logs"
    )
    logs: Mapped[List["Log"]] = relationship(back_populates="user_logs")
    itineraries: Mapped[List["Itinerary"]] = relationship(secondary=user_has_itinerary)
    inventories: Mapped[List["Inventory"]] = relationship(secondary=user_has_inventory)
    items: Mapped[List["Item"]] = relationship(secondary=user_has_items)
    auth_tokens: Mapped[List["AuthToken"]] = relationship(
        "AuthToken", back_populates="user", cascade="all, delete-orphan"
    )
    certifications: Mapped[List["UserCertification"]] = relationship(
        "UserCertification", back_populates="user", cascade="all, delete-orphan"
    )
    # Buddy connections — directed rows; query both columns for the symmetric view.
    # DB-level ON DELETE CASCADE handles teardown; relationships are viewonly to keep
    # all mutations in ConnectionService.
    connections_sent: Mapped[List["Connection"]] = relationship(
        "Connection",
        foreign_keys=[Connection.requester_id],
        viewonly=True,
    )
    connections_received: Mapped[List["Connection"]] = relationship(
        "Connection",
        foreign_keys=[Connection.addressee_id],
        viewonly=True,
    )
    blocks_made: Mapped[List["Block"]] = relationship(
        "Block",
        foreign_keys=[Block.blocker_id],
        viewonly=True,
    )

    def __repr__(self):
        return (
            f'<User "{self.id} {self.mail}, {self.name}, {self.surname}, {self.pwd}">'
        )
