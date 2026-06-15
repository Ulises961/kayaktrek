from Models.base_model import BaseModel
from sqlalchemy import UUID, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import List, Optional, TYPE_CHECKING
from uuid import UUID as _UUID

if TYPE_CHECKING:
    from Models.trip_requirement import TripRequirement

class Inventory(BaseModel):
    trip_id: Mapped[Optional[_UUID]] = mapped_column(UUID, ForeignKey('trip.id'), nullable=True, unique=True)
    user_id: Mapped[Optional[_UUID]] = mapped_column(UUID, ForeignKey('users.id', ondelete="CASCADE"), nullable=True)
    requirements: Mapped[List["TripRequirement"]] = relationship(
        "TripRequirement", cascade="all, delete-orphan", lazy="subquery"
    )

    def __repr__(self):
        return f'<Inventory "{self.id}">'
