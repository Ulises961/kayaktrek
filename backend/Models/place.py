import enum
from typing import Optional, TYPE_CHECKING
from uuid import UUID as _UUID

from geoalchemy2 import Geography
from sqlalchemy import Enum, ForeignKey, String, Text, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from Models.base_model import BaseModel

if TYPE_CHECKING:
    from Models.place_category import PlaceCategory


class PlaceVisibility(enum.Enum):
    PRIVATE = 'private'
    PUBLIC = 'public'


class Place(BaseModel):
    """A standing geographic mark a paddler drops on the map — freshwater, food,
    a campsite, a slipway, a hazard, a viewpoint. Deliberately NOT a Point: it
    takes no part in the route linked list (no next_id, no day, no ordering) and
    carries none of a Point's route consequences. It is its own entity, queried by
    proximity. Trip-scoped while planning; a null itinerary_id is reserved for a global
    community place (a public gazetteer tier that is not built). Modelled on the
    tidal-diamond pattern (TidalStation). See docs/adr/features.md (Map Annotations) and
    docs/adr/itinerary-frontend.md (point-type simplification)."""

    __tablename__ = "place"

    # Geography POINT for proximity queries in metres (ST_DWithin / ST_Distance on
    # the GiST index), mirroring Point.geo — no cast needed at query time.
    location = mapped_column(Geography(geometry_type='POINT', srid=4326), nullable=False)
    category_id: Mapped[_UUID] = mapped_column(
        UUID, ForeignKey("place_categories.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    label: Mapped[str] = mapped_column(String(255), nullable=False)
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Trip-scoped while planning; null is reserved for a global community place.
    itinerary_id: Mapped[Optional[_UUID]] = mapped_column(
        UUID, ForeignKey("itinerary.id", ondelete="CASCADE"), nullable=True, index=True
    )
    created_by_user_id: Mapped[Optional[_UUID]] = mapped_column(
        UUID, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    visibility: Mapped[PlaceVisibility] = mapped_column(
        Enum(PlaceVisibility, values_callable=lambda obj: [e.value for e in obj]),
        nullable=False,
        default=PlaceVisibility.PRIVATE,
    )

    # Eager-loaded so a marker list dumps each place's category (slug/name/icon)
    # without an N+1 — the category drives the marker glyph.
    category: Mapped["PlaceCategory"] = relationship(lazy="joined")

    @property
    def is_community(self) -> bool:
        return self.itinerary_id is None

    def __repr__(self) -> str:
        return f"<Place {self.label!r}>"
