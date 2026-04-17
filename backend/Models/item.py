from sqlalchemy import UUID, ForeignKey, String, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import Optional
from Models.base_model import BaseModel
from uuid import UUID as _UUID
from Models.item_category import ItemCategory

class Item(BaseModel):

    category_id: Mapped[Optional[_UUID]] = mapped_column(
        UUID, ForeignKey('item_categories.id'), nullable=True
    )
    category: Mapped[Optional["ItemCategory"]] = relationship("ItemCategory", lazy="joined")  # noqa: F821
    checked: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    user_id: Mapped[_UUID] = mapped_column(UUID, ForeignKey('users.id'), nullable=False)
