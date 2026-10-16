from datetime import time as _time
from decimal import Decimal
from Api.database import Base
from sqlalchemy import UUID, Time, Numeric, String, ForeignKeyConstraint
from sqlalchemy.orm import Mapped, mapped_column
from typing import Optional
from uuid import UUID as _UUID


class WeatherState(Base):
    __table_args__ = (
        ForeignKeyConstraint(
            ['day_id'],
            ['weather.day_id'],
            name="weather_day_foreign_keys_in_weather_state",
            ondelete="CASCADE",
        ),
    )
    day_id: Mapped[_UUID] = mapped_column(UUID, primary_key=True)
    time: Mapped[_time] = mapped_column(Time, primary_key=True)
    temperature: Mapped[Optional[Decimal]] = mapped_column(Numeric, nullable=True)
    precipitation: Mapped[Optional[Decimal]] = mapped_column(Numeric, nullable=True)
    wind_direction: Mapped[Optional[Decimal]] = mapped_column(Numeric, nullable=True)
    wind_force: Mapped[Optional[Decimal]] = mapped_column(Numeric, nullable=True)
    cloud: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)


    def __repr__(self) -> str:
        return f'<Weather state " time {self.time}, temperature {self.temperature}, wind direction {self.wind_direction}, wind force {self.wind_force}">'
