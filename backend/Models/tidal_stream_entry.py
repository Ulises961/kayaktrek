from typing import Optional, TYPE_CHECKING
from uuid import UUID as _UUID

from sqlalchemy import ForeignKey, Integer, Numeric, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from Api.database import db

if TYPE_CHECKING:
    from Models.tidal_station import TidalStation


class TidalStreamEntry(db.Model):
    __tablename__ = "tidal_stream_entry"

    station_id: Mapped[_UUID] = mapped_column(
        UUID,
        ForeignKey("tidal_station.id", ondelete="CASCADE"),
        primary_key=True,
    )
    hours_from_hw: Mapped[int] = mapped_column(Integer, primary_key=True)
    direction_degrees: Mapped[Optional[object]] = mapped_column(Numeric, nullable=True)
    spring_rate_knots: Mapped[Optional[object]] = mapped_column(Numeric, nullable=True)
    neap_rate_knots: Mapped[Optional[object]] = mapped_column(Numeric, nullable=True)

    station: Mapped["TidalStation"] = relationship(back_populates="tidal_stream_entries")

    def __repr__(self) -> str:
        return f"<TidalStreamEntry station={self.station_id} h={self.hours_from_hw}>"
