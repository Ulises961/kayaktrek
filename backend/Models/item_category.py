from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from Models.base_model import BaseModel


class ItemCategory(BaseModel):
    __tablename__ = "item_categories"

    slug: Mapped[str] = mapped_column(String(100), nullable=False, unique=True, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
