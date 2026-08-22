import enum
from datetime import date, datetime
from typing import Optional, List, TYPE_CHECKING

from sqlalchemy import Boolean, Date, DateTime, Enum, String
from sqlalchemy.ext.associationproxy import association_proxy
from sqlalchemy.orm import Mapped, mapped_column, relationship

from Models.base_model import BaseModel
from Models.difficulty import DifficultyType, difficulty_enum

if TYPE_CHECKING:
    from Models.itinerary import Itinerary
    from Models.inventory import Inventory
    from Models.user import User
    from Models.trip_member import TripMember
    from Models.invitation import Invitation
    from Models.logistics import Logistics
    from Models.travel_document import TravelDocument
    from Models.shuttle_vehicle import ShuttleVehicle


class TripStateType(enum.Enum):
    BUILDING = "building"
    HAPPENING = "happening"
    PAST = "past"
    ARCHIVED = "archived"


class TripOutcomeType(enum.Enum):
    COMPLETED = "completed"
    INTERRUPTED = "interrupted"


_VALID_TRANSITIONS = {
    TripStateType.BUILDING: TripStateType.HAPPENING,
    TripStateType.HAPPENING: TripStateType.PAST,
}


class Trip(BaseModel):
    logistics: Mapped[Optional["Logistics"]] = relationship(
        "Logistics",
        back_populates="trip",
        uselist=False,
        cascade="all, delete-orphan",
    )
    travel_documents: Mapped[List["TravelDocument"]] = relationship(
        "TravelDocument",
        back_populates="trip",
        cascade="all, delete-orphan",
    )
    shuttle_vehicles: Mapped[List["ShuttleVehicle"]] = relationship(
        "ShuttleVehicle",
        back_populates="trip",
        cascade="all, delete-orphan",
    )
    inventory: Mapped[Optional["Inventory"]] = relationship(
        foreign_keys="Inventory.trip_id",
        uselist=False,
        cascade="all, delete,save-update",
    )
    itinerary: Mapped[Optional["Itinerary"]] = relationship(
        foreign_keys="Itinerary.trip_id",
        uselist=False,
        cascade="all, delete,save-update",
    )
    # Association object: full role-aware access
    #
    # passive_deletes=True: trip_member.trip_id already has ondelete="CASCADE" at the
    # DB level (matching the reverse TripMember.trip side, which already sets
    # passive_deletes=True) — deleting a Trip should just trust the DB cascade rather
    # than the ORM re-deriving the same result. TripMember.__mapper_args__'s
    # confirm_deleted_rows=False covers the remaining benign rowcount-mismatch warning
    # this alone doesn't silence — see that model for why.
    trip_members: Mapped[List["TripMember"]] = relationship(
        "TripMember",
        back_populates="trip",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    # Viewonly convenience relationship — use trip_members for mutations
    travellers: Mapped[List["User"]] = relationship(
        secondary="trip_member", viewonly=True
    )
    invitations: Mapped[List["Invitation"]] = relationship(
        "Invitation",
        back_populates="trip",
        cascade="all, delete-orphan",
    )
    # Proxy: exposes the invited User objects via the invitations collection.
    # TripSchema.pending_travellers uses this attribute — keeps serialisation unchanged.
    pending_travellers = association_proxy("invitations", "user")

    # The leader's subjective call for this crew on this date. Distinct from
    # Itinerary.difficulty, which rates the route itself and is what /explore filters on.
    difficulty: Mapped[Optional[DifficultyType]] = mapped_column(
        difficulty_enum, nullable=True
    )
    state: Mapped[TripStateType] = mapped_column(
        Enum(TripStateType, values_callable=lambda obj: [e.value for e in obj]),
        nullable=False,
        default=TripStateType.BUILDING,
        index=True,
    )
    destination: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    description: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    date_from: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    date_to: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    is_paused: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    paused_at: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    outcome: Mapped[Optional[TripOutcomeType]] = mapped_column(
        Enum(TripOutcomeType, values_callable=lambda obj: [e.value for e in obj]),
        nullable=True,
    )
    last_checkpoint_alert_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    # IANA zone name (e.g. "Europe/London"), resolved from the itinerary's first point on the
    # building→happening transition — no coordinates exist yet at trip creation (ADR-021 deviation).
    timezone_name: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)

    def transition_state(self, new_state: TripStateType) -> None:
        """Advance the trip state forward. Raises ValueError for invalid transitions.

        A paused trip cannot transition state through this generic path — per
        ADR-025 (docs/adr/trip-lifecycle.md), abort() is "the only way to reach
        past without resuming" while paused. Without this guard, POST .../state
        could carry a paused happening trip straight to past, leaving is_paused/
        paused_at stale on a supposedly-terminal trip and defaulting outcome to
        COMPLETED instead of the INTERRUPTED an aborted trip should record.
        """
        if self.is_paused:
            raise ValueError(
                f"Cannot transition trip '{self.id}' while paused — resume or abort first"
            )
        if _VALID_TRANSITIONS.get(self.state) != new_state:
            raise ValueError(
                f"Cannot transition from '{self.state.value}' to '{new_state.value}'"
            )
        if self.state == TripStateType.HAPPENING and new_state == TripStateType.PAST and self.outcome is None:
            self.outcome = TripOutcomeType.COMPLETED
        self.state = new_state
