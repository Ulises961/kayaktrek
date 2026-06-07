from typing import Optional, List, TYPE_CHECKING

from geoalchemy2 import Geometry
from sqlalchemy import Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from Models.base_model import BaseModel

if TYPE_CHECKING:
    from Models.tidal_stream_entry import TidalStreamEntry


class TidalStation(BaseModel):
    __tablename__ = "tidal_station"

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    location: Mapped[object] = mapped_column(Geometry("POINT", srid=4326, spatial_index=False), nullable=False)
    source: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    mean_spring_range_m: Mapped[Optional[object]] = mapped_column(Numeric, nullable=True)

    tidal_stream_entries: Mapped[List["TidalStreamEntry"]] = relationship(
        back_populates="station",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<TidalStation {self.name!r}>"
