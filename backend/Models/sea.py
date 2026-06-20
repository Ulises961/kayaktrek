from datetime import time as _time

from Api.database import Base, db
from sqlalchemy import UUID, DateTime, Integer, Numeric, String, Time, ForeignKeyConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import List, Optional, TYPE_CHECKING
from uuid import UUID as _UUID

if TYPE_CHECKING:
    from Models.sea_state import SeaState


class Sea(Base):
    __table_args__ = (
        ForeignKeyConstraint(['day_id'], ['day.id'], name="day_foreign_key_in_sea"),
    )
    day_id: Mapped[_UUID] = mapped_column(UUID, primary_key=True)
    moon_phase: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    high_tide: Mapped[Optional[_time]] = mapped_column(Time, nullable=True)
    low_tide: Mapped[Optional[_time]] = mapped_column(Time, nullable=True)
    tidal_range_m: Mapped[Optional[float]] = mapped_column(Numeric(asdecimal=False), nullable=True)
    reference_port_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    hw_time_offset_minutes: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    lw_time_offset_minutes: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    hw_height_ratio: Mapped[Optional[float]] = mapped_column(Numeric(asdecimal=False), nullable=True)
    lw_height_ratio: Mapped[Optional[float]] = mapped_column(Numeric(asdecimal=False), nullable=True)
    tidal_source: Mapped[str] = mapped_column(String(50), nullable=False, server_default="manual")
    flood_direction_degrees: Mapped[Optional[float]] = mapped_column(Numeric(asdecimal=False), nullable=True)
    ebb_direction_degrees: Mapped[Optional[float]] = mapped_column(Numeric(asdecimal=False), nullable=True)
    max_spring_rate_knots: Mapped[Optional[float]] = mapped_column(Numeric(asdecimal=False), nullable=True)
    max_neap_rate_knots: Mapped[Optional[float]] = mapped_column(Numeric(asdecimal=False), nullable=True)

    sea_states: Mapped[List["SeaState"]] = relationship(foreign_keys="SeaState.day_id", cascade='all, delete,save-update')
    recorded_at: Mapped[DateTime] = mapped_column(DateTime, nullable=False, server_default=db.func.now())
