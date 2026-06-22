from uuid import UUID as _UUID
from typing import TYPE_CHECKING

from sqlalchemy import UUID, Boolean, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from Models.base_model import BaseModel

if TYPE_CHECKING:
    from Models.trip_member import TripMember
    from Models.item import Item


class RequirementContribution(BaseModel):
    """One member bringing one of their owned items to cover a requirement slot.

    A requirement may be covered by several members (e.g. a second spare), but each
    member contributes at most once per requirement — enforced by the unique
    constraint below. Packing confirmation (`checked`) lives here, per contributor,
    not on the shared requirement.
    """

    __tablename__ = "requirement_contribution"
    __table_args__ = (
        UniqueConstraint(
            "requirement_id",
            "trip_member_id",
            name="uq_requirement_contribution_req_member",
        ),
    )

    requirement_id: Mapped[_UUID] = mapped_column(
        UUID,
        ForeignKey("trip_requirement.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    trip_member_id: Mapped[_UUID] = mapped_column(
        UUID,
        ForeignKey("trip_member.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    item_id: Mapped[_UUID] = mapped_column(
        UUID,
        ForeignKey("item.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    checked: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    member: Mapped["TripMember"] = relationship("TripMember")
    item: Mapped["Item"] = relationship("Item")
