from datetime import datetime as _datetime

from Api.database import Base, db
from sqlalchemy import UUID, DateTime, String, ForeignKeyConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from typing import Optional, List, TYPE_CHECKING
from uuid import UUID as _UUID

if TYPE_CHECKING:
    from Models.weather_state import WeatherState


class Weather(Base):
    __table_args__ = (
        ForeignKeyConstraint(
            ['day_id'], ['day.id'], name="day_foreign_key_in_weather", ondelete="CASCADE"
        ),
    )
    day_id: Mapped[_UUID] = mapped_column(UUID, primary_key=True)
    model: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    # Bumped explicitly by _upsert_weather on every fetch (not left to onupdate,
    # since not every fetch re-assigns another column to trigger it). Answers both
    # "changed since lastPulledAt" for mobile sync-down and the mandatory
    # "forecast as of [timestamp]" label — see docs/mobile/sync-protocol-spec.md §6.3.
    fetched_at: Mapped[_datetime] = mapped_column(DateTime, nullable=False, server_default=db.func.now())

    weather_states: Mapped[List["WeatherState"]] = relationship(foreign_keys="WeatherState.day_id", cascade='all, delete,save-update')

    def __repr__(self):
        return f'<Weather "Day id {self.day_id}, Model {self.model} Weather states {self.weather_states}">'
