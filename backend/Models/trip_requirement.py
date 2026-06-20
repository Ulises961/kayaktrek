import enum
from uuid import UUID as _UUID
from typing import List, Optional, TYPE_CHECKING

from sqlalchemy import UUID, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from Models.base_model import BaseModel

if TYPE_CHECKING:
    from Models.trip_member import TripMember
    from Models.requirement_contribution import RequirementContribution


class RequirementStatusType(enum.Enum):
    NEEDED = "needed"
    COVERED = "covered"


class TripRequirement(BaseModel):
    __tablename__ = "trip_requirement"

    inventory_id: Mapped[_UUID] = mapped_column(
        UUID, ForeignKey("inventory.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    category: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    # Provenance: NULL until CatalogItem templates (future)
    catalog_item_id: Mapped[Optional[_UUID]] = mapped_column(UUID, nullable=True)

    # Authorship: the member who proposed this requirement. Template/default
    # requirements are stamped to the leader's TripMember, so "leader controls the
    # defaults" falls out of defaults being leader-owned rather than being a special
    # case. Delete rule: you may remove a requirement iff you proposed it.
    proposed_by_member_id: Mapped[_UUID] = mapped_column(
        UUID,
        ForeignKey("trip_member.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    proposed_by: Mapped["TripMember"] = relationship("TripMember")
    contributions: Mapped[List["RequirementContribution"]] = relationship(
        "RequirementContribution",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    @property
    def status(self) -> RequirementStatusType:
        """Derived, never stored: covered when at least one member is bringing an
        item for this slot, else needed. Deriving it makes the value immune to the
        staleness that a stored column would suffer when contributions cascade away
        on member-leave."""
        return (
            RequirementStatusType.COVERED
            if self.contributions
            else RequirementStatusType.NEEDED
        )
