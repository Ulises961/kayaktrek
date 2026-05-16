import enum
from uuid import UUID as _UUID
from typing import List, Optional, TYPE_CHECKING

from sqlalchemy import UUID, Boolean, Enum, ForeignKey, String, Table, Column
from sqlalchemy.orm import Mapped, mapped_column, relationship

from Api.database import db
from Models.base_model import BaseModel

if TYPE_CHECKING:
    from Models.item import Item
    from Models.trip_member import TripMember
    from Models.user import User


class RequirementStatusType(enum.Enum):
    NEEDED = "needed"
    COVERED = "covered"


requirement_contributors = Table(
    "requirement_contributors",
    db.Model.metadata,
    Column(
        "requirement_id",
        UUID,
        ForeignKey("trip_requirement.id", ondelete="CASCADE"),
        primary_key=True,
    ),
    Column(
        "trip_member_id",
        UUID,
        ForeignKey("trip_member.id", ondelete="CASCADE"),
        primary_key=True,
    ),
)


class TripRequirement(BaseModel):
    __tablename__ = "trip_requirement"

    inventory_id: Mapped[_UUID] = mapped_column(
        UUID, ForeignKey("inventory.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    category: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    # Provenance: NULL until M6 (CatalogItem templates)
    catalog_item_id: Mapped[Optional[_UUID]] = mapped_column(UUID, nullable=True)

    # The personal item that covers this requirement slot (nullable until contributed)
    covering_item_id: Mapped[Optional[_UUID]] = mapped_column(
        UUID, ForeignKey("item.id", ondelete="SET NULL"), nullable=True, index=True
    )

    checked: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    status: Mapped[RequirementStatusType] = mapped_column(
        Enum(RequirementStatusType, values_callable=lambda obj: [e.value for e in obj]),
        nullable=False,
        default=RequirementStatusType.NEEDED,
    )

    covering_item: Mapped[Optional["Item"]] = relationship(
        "Item", foreign_keys=[covering_item_id]
    )
    contributors: Mapped[List["TripMember"]] = relationship(
        "TripMember", secondary=requirement_contributors
    )

    @property
    def contributor_users(self) -> List["User"]:
        return [m.user for m in self.contributors]
