from uuid import UUID as _UUID
from typing import Optional

from sqlalchemy import UUID, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from Models.base_model import BaseModel
from Models.item_category import ItemCategory


class CatalogItem(BaseModel):
    """A curator's personal template for a trip's shared requirement list.

    Not trip-scoped — reused across every trip the owner creates. `trip_service.
    create_trip` seeds a new trip's TripRequirement rows from the leader's
    CatalogItem rows when non-empty, falling back to the hardcoded
    DEFAULT_TRIP_REQUIREMENTS list for curators who have none yet.
    """

    __tablename__ = "catalog_item"

    owner_id: Mapped[_UUID] = mapped_column(
        UUID, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    category_id: Mapped[Optional[_UUID]] = mapped_column(
        UUID, ForeignKey("item_categories.id"), nullable=True, index=True
    )
    category: Mapped[Optional["ItemCategory"]] = relationship("ItemCategory", lazy="joined")
