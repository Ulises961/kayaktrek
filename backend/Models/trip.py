import enum
from datetime import date
from typing import Optional, List, TYPE_CHECKING

from sqlalchemy import Date, Enum, String
from sqlalchemy.ext.associationproxy import association_proxy
from sqlalchemy.orm import Mapped, mapped_column, relationship

from Models.base_model import BaseModel

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


class TripDifficultyType(enum.Enum):
    EASY = "easy"
    MODERATE = "moderate"
    DEMANDING = "demanding"
    EXPERT = "expert"


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
    trip_members: Mapped[List["TripMember"]] = relationship(
        "TripMember",
        back_populates="trip",
        cascade="all, delete-orphan",
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

    difficulty: Mapped[Optional[TripDifficultyType]] = mapped_column(
        Enum(TripDifficultyType, values_callable=lambda obj: [e.value for e in obj]),
        nullable=True,
    )
    state: Mapped[TripStateType] = mapped_column(
        Enum(TripStateType, values_callable=lambda obj: [e.value for e in obj]),
        nullable=False,
        default=TripStateType.BUILDING,
        index=True,
    )
    destination: Mapped[String] = mapped_column(String, nullable=True)
    description: Mapped[String] = mapped_column(String, nullable=True)
    date_from: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    date_to: Mapped[Optional[date]] = mapped_column(Date, nullable=True)

    def transition_state(self, new_state: TripStateType) -> None:
        """Advance the trip state forward. Raises ValueError for invalid transitions."""
        if _VALID_TRANSITIONS.get(self.state) != new_state:
            raise ValueError(
                f"Cannot transition from '{self.state.value}' to '{new_state.value}'"
            )
        self.state = new_state
