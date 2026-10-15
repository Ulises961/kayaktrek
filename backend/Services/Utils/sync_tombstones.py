"""Wires ORM `after_delete` events that write to SyncTombstone (see that model's
docstring) for every synced table that isn't the route.

`after_delete` fires per-instance for both a direct delete and an ORM-cascaded
one (Day.weather/Day.sea/Trip.trip_members etc. all cascade="all, delete..." at
the ORM level, not just via the DB's own ondelete="CASCADE") — so hooking it
here covers every deletion path without threading a tombstone call into each
service method individually. SQLAlchemy's unit of work deletes children before
parents in one flush, so a lookup like Weather's day -> itinerary join below is
always safe: the parent row a tombstone needs to read is still in the database
when the child's after_delete fires.

Importing this module registers the listeners (decorators execute at import
time); Api/app.py imports it once for that side effect, same convention as the
"Models without resources" import block just above it.
"""
import logging
from typing import Any, Optional
from uuid import UUID

from sqlalchemy import event, insert, select
from sqlalchemy.engine import Connection
from sqlalchemy.orm import Mapper

from Models.day import Day
from Models.inventory import Inventory
from Models.itinerary import Itinerary
from Models.requirement_contribution import RequirementContribution
from Models.sea import Sea
from Models.sync_tombstone import SyncTombstone
from Models.trip_member import TripMember
from Models.trip_requirement import TripRequirement
from Models.weather import Weather

logger = logging.getLogger(__name__)


def _write_tombstone(
    connection: Connection, table_name: str, record_id: UUID, trip_id: Optional[UUID]
) -> None:
    if trip_id is None:
        # No trip to scope this deletion to shouldn't happen for a row any mobile
        # pull could have seen, since every synced table here traces back to a
        # trip — logged rather than raised, since a missing tombstone degrades to
        # "device shows a stale row" rather than corrupting anything.
        logger.warning(
            "sync_tombstone_missing_trip_id",
            extra={"table_name": table_name, "record_id": str(record_id)},
        )
        return
    connection.execute(
        insert(SyncTombstone).values(
            table_name=table_name, record_id=record_id, trip_id=trip_id,
        )
    )


@event.listens_for(Weather, "after_delete")
def _tombstone_weather(mapper: Mapper[Any], connection: Connection, target: Weather) -> None:
    trip_id = connection.execute(
        select(Itinerary.__table__.c.trip_id)
        .select_from(Day.__table__.join(Itinerary.__table__, Day.itinerary_id == Itinerary.id))
        .where(Day.__table__.c.id == target.day_id)
    ).scalar()
    _write_tombstone(connection, "weather", target.day_id, trip_id)


@event.listens_for(Sea, "after_delete")
def _tombstone_sea(mapper: Mapper[Any], connection: Connection, target: Sea) -> None:
    trip_id = connection.execute(
        select(Itinerary.__table__.c.trip_id)
        .select_from(Day.__table__.join(Itinerary.__table__, Day.itinerary_id == Itinerary.id))
        .where(Day.__table__.c.id == target.day_id)
    ).scalar()
    _write_tombstone(connection, "sea", target.day_id, trip_id)


@event.listens_for(TripMember, "after_delete")
def _tombstone_trip_member(mapper: Mapper[Any], connection: Connection, target: TripMember) -> None:
    _write_tombstone(connection, "trip_member", target.id, target.trip_id)


@event.listens_for(RequirementContribution, "after_delete")
def _tombstone_requirement_contribution(
    mapper: Mapper[Any], connection: Connection, target: RequirementContribution
) -> None:
    trip_id = connection.execute(
        select(Inventory.__table__.c.trip_id)
        .select_from(
            TripRequirement.__table__.join(
                Inventory.__table__, TripRequirement.inventory_id == Inventory.id
            )
        )
        .where(TripRequirement.__table__.c.id == target.requirement_id)
    ).scalar()
    _write_tombstone(connection, "requirement_contribution", target.id, trip_id)
