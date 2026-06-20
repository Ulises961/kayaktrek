from typing import Optional

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from Models.base_model import BaseModel


class PlaceCategory(BaseModel):
    """A kind of map place — freshwater, food, campsite, slipway, hazard… Modelled
    as an entity (not an enum) so the catalogue can grow without a migration, the
    same decision taken for ItemCategory in M2. `icon` names the marker glyph so a
    new category brings its own icon without a frontend change. The create gate is
    deliberately closed for now: categories are seeded at startup and read via a
    public GET; user/admin authoring is a future step."""

    __tablename__ = "place_categories"

    slug: Mapped[str] = mapped_column(String(100), nullable=False, unique=True, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    icon: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    def __repr__(self) -> str:
        return f"<PlaceCategory {self.slug!r}>"
