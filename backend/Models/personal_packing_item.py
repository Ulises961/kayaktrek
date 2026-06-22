from uuid import UUID as _UUID
from typing import TYPE_CHECKING

from sqlalchemy import UUID, Boolean, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from Models.base_model import BaseModel

if TYPE_CHECKING:
    from Models.item import Item


class PersonalPackingItem(BaseModel):
    """A member's private per-trip packing entry: one of their own gear-closet items
    they are carrying for themselves on this trip.

    Distinct from a RequirementContribution — that covers a shared group slot; this is
    personal kit, never lent to the group. Private to the owning member (the leader has
    no special access). Scoped through its TripMember to one trip and one user.
    """

    __tablename__ = "personal_packing_item"
    __table_args__ = (
        UniqueConstraint(
            "trip_member_id",
            "item_id",
            name="uq_personal_packing_item_member_item",
        ),
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

    item: Mapped["Item"] = relationship("Item")
