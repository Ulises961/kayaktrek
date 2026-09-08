from typing import Optional
from uuid import UUID as _UUID

from geoalchemy2 import Geometry
from sqlalchemy import ForeignKey, String, Text, UUID
from sqlalchemy.orm import Mapped, mapped_column

from Models.base_model import BaseModel


class WindDiamond(BaseModel):
    """A static reminder that a place is known to originate or accelerate wind
    (e.g. katabatic/valley-drainage flow) — never forecast-driven, and carries
    no rate/direction/intensity value (M27, docs/adr/features.md "Revision
    (M27)"). Always itinerary-owned; unlike TidalStation there is no
    atlas-seeded tier."""

    __tablename__ = "wind_diamond"

    name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    location: Mapped[object] = mapped_column(Geometry("POINT", srid=4326, spatial_index=True), nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    itinerary_id: Mapped[_UUID] = mapped_column(
        UUID, ForeignKey("itinerary.id", ondelete="CASCADE"), nullable=False, index=True
    )
    created_by_user_id: Mapped[Optional[_UUID]] = mapped_column(
        UUID, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    def __repr__(self) -> str:
        return f"<WindDiamond {self.name or self.id!r}>"
