from datetime import date as _date

from sqlalchemy import UUID, UniqueConstraint, Integer, Date, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import List, Optional, TYPE_CHECKING

from Models.base_model import BaseModel
from uuid import UUID as _UUID

if TYPE_CHECKING:
    from Models.point import Point
    from Models.weather import Weather
    from Models.sea import Sea


class Day(BaseModel):
    __table_args__ = (UniqueConstraint("day_number", "itinerary_id"),)

    day_number: Mapped[int] = mapped_column(Integer)
    itinerary_id: Mapped[_UUID] = mapped_column(
        UUID, ForeignKey("itinerary.id", ondelete="CASCADE"), index=True
    )
    date: Mapped[Optional[_date]] = mapped_column(Date, nullable=True)
    start_point_id: Mapped[Optional[_UUID]] = mapped_column(UUID, ForeignKey("point.id", ondelete="SET NULL"), nullable=True)
    end_point_id: Mapped[Optional[_UUID]] = mapped_column(UUID, ForeignKey("point.id", ondelete="SET NULL"), nullable=True)

    # cascade="all, delete" mirrors weather/sea below. Without it SQLAlchemy NULLs a loaded
    # child's day_id (its default "disassociate" for a non-cascaded one-to-many) before the Day
    # DELETE, so the DB-level ondelete="CASCADE" on Point.day_id never fires and the Points
    # survive as orphans with day_id=NULL. Deleting an itinerary always hits this, because
    # ItineraryService.get_itinerary_by_id eager-loads its days and points.
    points: Mapped[Optional[List["Point"]]] = relationship(
        foreign_keys="Point.day_id", cascade="all, delete, save-update"
    )
    weather: Mapped[Optional["Weather"]] = relationship(
        foreign_keys="Weather.day_id", uselist=False, cascade="all,delete,save-update"
    )
    sea: Mapped[Optional["Sea"]] = relationship(
        foreign_keys="Sea.day_id", uselist=False, cascade="all, delete,save-update"
    )

    def __repr__(self) -> str:
        return f'<Day "{self.day_number}, Date {self.date}, Itinerary {self.itinerary_id}">'
