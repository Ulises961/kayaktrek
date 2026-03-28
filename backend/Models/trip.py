import enum
import uuid

import uuid_extension
from Api.database import db
from sqlalchemy import Enum, String
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import Optional, List, TYPE_CHECKING

from Models.base_model import BaseModel

if TYPE_CHECKING:
    from Models.itinerary import Itinerary
    from Models.inventory import Inventory
    from Models.user import User


class TripStateType(enum.Enum):
    DRAFT = "draft"
    PLANNING = "planning"
    HAPPENING = "happening"
    PAST = "past"


_VALID_TRANSITIONS = {
    TripStateType.DRAFT: TripStateType.PLANNING,
    TripStateType.PLANNING: TripStateType.HAPPENING,
    TripStateType.HAPPENING: TripStateType.PAST,
}


class Trip(BaseModel):
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
    travellers: Mapped[List["User"]] = relationship(
        secondary="user_has_trip", back_populates="trips"
    )
    pending_travellers: Mapped[List["User"]] = relationship(
        secondary="user_has_invitation", back_populates="invitations"
    )
    state: Mapped[TripStateType] = mapped_column(
        Enum(TripStateType), nullable=False, default=TripStateType.DRAFT
    )
    destination: Mapped[String] = mapped_column(String, nullable=True)
    description: Mapped[String] = mapped_column(String, nullable=True)

    def transition_state(self, new_state: TripStateType) -> None:
        """Advance the trip state forward. Raises ValueError for invalid transitions."""
        if _VALID_TRANSITIONS.get(self.state) != new_state:
            raise ValueError(
                f"Cannot transition from '{self.state.value}' to '{new_state.value}'"
            )
        self.state = new_state