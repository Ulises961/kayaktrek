import enum
from typing import Optional, List, TYPE_CHECKING
from uuid import UUID as _UUID

from geoalchemy2 import Geometry
from sqlalchemy import Enum, ForeignKey, Numeric, String, Text, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from Models.base_model import BaseModel

if TYPE_CHECKING:
    from Models.tidal_stream_entry import TidalStreamEntry


class StreamEntryMode(enum.Enum):
    ATLAS = 'atlas'
    SIMPLE = 'simple'


class TidalStation(BaseModel):
    __tablename__ = "tidal_station"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    # spatial_index=True lets GeoAlchemy2 track the existing GiST index (`idx_tidal_station_location`,
    # created by a raw migration) so Alembic autogenerate does not report it as drift. It changes no DDL.
    location: Mapped[object] = mapped_column(Geometry("POINT", srid=4326, spatial_index=True), nullable=False)
    source: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    mean_spring_range_m: Mapped[Optional[float]] = mapped_column(Numeric(asdecimal=False), nullable=True)

    # User-created diamonds are scoped to one itinerary; null = globally seeded atlas station.
    itinerary_id: Mapped[Optional[_UUID]] = mapped_column(
        UUID, ForeignKey("itinerary.id", ondelete="CASCADE"), nullable=True, index=True
    )
    created_by_user_id: Mapped[Optional[_UUID]] = mapped_column(
        UUID, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    radius_m: Mapped[Optional[float]] = mapped_column(Numeric(asdecimal=False), nullable=True)
    entry_mode: Mapped[Optional[StreamEntryMode]] = mapped_column(
        Enum(StreamEntryMode, values_callable=lambda obj: [e.value for e in obj]),
        nullable=True,
    )

    tidal_stream_entries: Mapped[List["TidalStreamEntry"]] = relationship(
        back_populates="station",
        cascade="all, delete-orphan",
    )

    @property
    def is_user_created(self) -> bool:
        return self.itinerary_id is not None

    def __repr__(self) -> str:
        return f"<TidalStation {self.name!r}>"
