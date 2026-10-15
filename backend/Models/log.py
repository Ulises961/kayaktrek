from datetime import date as _date
from typing import List, Optional, TYPE_CHECKING
from uuid import UUID as _UUID

from sqlalchemy import UUID, Date, Integer, Numeric, ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from Models.base_model import BaseModel
from Models.user_endorses_log import user_endorses_log

if TYPE_CHECKING:
    from Models.user import User
    from Models.trip import Trip


class Log(BaseModel):
    hours: Mapped[Optional[Numeric]] = mapped_column(Numeric, nullable=True)
    avg_sea: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    distance: Mapped[Optional[Numeric]] = mapped_column(Numeric, nullable=True)
    date: Mapped[Optional[_date]] = mapped_column(Date, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(String(2000), nullable=True)
    # ondelete=CASCADE matches actual intended behaviour: Tasks/erasure.py explicitly
    # deletes a user's logs before deleting the user row. Declaring it here means that
    # stays true even if a future deletion path forgets to repeat that step by hand.
    user_id: Mapped[Optional[_UUID]] = mapped_column(
        UUID, ForeignKey('users.id', ondelete='CASCADE'), nullable=True, index=True
    )
    # The trip this log documents — the endorsement key. Nullable: a manually-created standalone
    # log has no trip and is non-endorsable. ondelete=SET NULL so deleting a trip detaches a
    # member's personal logbook entry rather than deleting it, which also makes it non-endorsable.
    trip_id: Mapped[Optional[_UUID]] = mapped_column(
        UUID, ForeignKey('trip.id', ondelete='SET NULL'), nullable=True, index=True
    )
    # GeoJSON LineString of ordered position pings for the day, [lon, lat] pairs.
    # Null for manual logs and stub auto-logs with no ping data.
    route_geojson: Mapped[Optional[dict]] = mapped_column(JSONB, nullable=True)
    source: Mapped[str] = mapped_column(String(16), nullable=False, default='manual', server_default='manual')

    user_logs: Mapped[List["User"]] = relationship(back_populates='logs')
    trip: Mapped[Optional["Trip"]] = relationship()
    user_endorsed_logs: Mapped[List["User"]] = relationship(
        secondary=user_endorses_log, back_populates='endorsed_logs'
    )

    def __repr__(self):
        return f'<Log "{self.id}, User {self.user_id}">'
