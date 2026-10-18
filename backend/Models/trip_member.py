import enum
from datetime import datetime
from uuid import UUID as _UUID
from sqlalchemy import UUID, ForeignKey, Enum, UniqueConstraint, Index, String, Integer, Text, DateTime, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship
from Models.base_model import BaseModel
from typing import Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from Models.user import User
    from Models.trip import Trip


class MemberRoleType(enum.Enum):
    LEADER = "leader"
    CREW = "crew"


class TripMember(BaseModel):
    __tablename__ = "trip_member"
    __table_args__ = (
        UniqueConstraint('user_id', 'trip_id', name='uq_trip_member_user_trip'),
        # At most one nominated successor per trip.
        Index(
            'uq_trip_member_one_nominee_per_trip',
            'trip_id',
            unique=True,
            postgresql_where="nominated_successor",
        ),
    )
    # A trip_member row is reachable via two independent cascade-delete paths to the
    # same physical row (Trip.trip_members and User.trip_memberships, both
    # "all, delete-orphan" with a DB-level ondelete="CASCADE" FK on each side). When
    # both a trip and one of its members' User rows are deleted in the same session,
    # whichever cascade runs second issues its DELETE against an in-session collection
    # count that the other cascade has already made stale, and SQLAlchemy's default
    # per-statement rowcount assertion mismatches — a benign false positive (the row is
    # correctly gone either way), not silenced by passive_deletes alone. See
    # Trip.trip_members / User.trip_memberships docstrings.
    __mapper_args__ = {"confirm_deleted_rows": False}

    user_id: Mapped[_UUID] = mapped_column(UUID, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    trip_id: Mapped[_UUID] = mapped_column(UUID, ForeignKey("trip.id", ondelete="CASCADE"), nullable=False, index=True)
    role: Mapped[MemberRoleType] = mapped_column(
        Enum(MemberRoleType, values_callable=lambda obj: [e.value for e in obj]),
        nullable=False,
    )

    # Leader-designated successor — plain pointer, not a second live leader (the
    # medical-notes ECIES model assumes exactly one leader). Consulted by
    # TripLeadershipService.claim_leadership when the trip has no leader.
    nominated_successor: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # Vessel — snapshot at time of joining; editable independently of User profile defaults
    vessel_make: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    vessel_model: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    vessel_length_cm: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    vessel_color_primary: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    vessel_color_secondary: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    # Emergency contact — snapshot
    emergency_contact_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    emergency_contact_phone: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    emergency_contact_relationship: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    # Per-trip medical notes — an independent copy, not derived from the User profile at read time.
    # Sealed on the client with a key derived from the member's password (AES-GCM); the server
    # stores only the ciphertext, nonce and salt.
    medical_notes_ciphertext: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    medical_notes_nonce: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    medical_notes_salt: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)

    # Leader-visible copy, sealed on the client to the leader's X25519 public key (ECIES,
    # ADR-023), so only the leader can open it. Written by share_medical_notes(); nulled by
    # revoke_trip_medical_notes().
    medical_notes_leader_ciphertext: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    medical_notes_leader_nonce: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    medical_notes_leader_ephemeral_key: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    medical_notes_consent_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    # Set on any successful PATCH to this member's float plan fields
    float_plan_confirmed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    # Set by the leader when this paddler leaves a trip under way — injury, evacuation,
    # picked up by the support boat. Distinct from removal, which erases the person
    # from the trip's record: the float plan and shore contact need to know who was on
    # the water, and until when.
    left_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    left_note: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    # The paddler's own switch for the satellite feed registered in their settings. The
    # feed's positions are posted to this trip only while the switch is on, the trip is
    # happening and left_at is empty. Off until the paddler turns it on for this trip.
    shares_satellite_position: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )

    user: Mapped["User"] = relationship(back_populates="trip_memberships", passive_deletes=True)
    trip: Mapped["Trip"] = relationship(back_populates="trip_members", passive_deletes=True)
