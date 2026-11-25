"""Collects row-level changes to trip-scoped models and publishes them once the
transaction commits.

Trip-scoped writes are spread over most services plus the mobile mutation queue, so
instead of a publish call in each one, ORM session events watch every flush — the same
reason `sync_tombstones.py` hooks `after_delete` rather than threading a call through
each service. Importing this module registers the listeners; Api/app.py imports it once
for that side effect.

Three timings matter:
  * `before_flush` records deletions, because the parent rows a resolver joins through
    are still in the database then (a cascaded child's trip is unresolvable afterwards).
  * `after_flush` records creations and updates, because association rows (an Image's
    link to its Point) are written during the flush and only resolvable after it.
  * `after_commit` publishes. Publishing earlier would let a subscriber refetch a row
    that is not yet visible. `after_rollback` discards, so a failed write notifies no one.

A model is either in `TRIP_SCOPED_RESOLVERS` or in `EXCLUDED_MODELS`; the test suite fails
for any mapped class that is in neither, so a new model cannot be silently left out.
"""
import logging
from collections import defaultdict
from typing import Any, Callable, Optional
from uuid import UUID

from sqlalchemy import event, inspect, select
from sqlalchemy.engine import Connection
from sqlalchemy.orm import Session
from sqlalchemy.orm.unitofwork import UOWTransaction
from sqlalchemy.sql.expression import Executable

from Models.auth_token import AuthToken
from Models.block import Block
from Models.catalog_item import CatalogItem
from Models.connection import Connection as PaddlerConnection
from Models.day import Day
from Models.endorsement_request import EndorsementRequest
from Models.image import Image
from Models.inventory import Inventory
from Models.invitation import Invitation
from Models.item import Item
from Models.item_category import ItemCategory
from Models.itinerary import Itinerary
from Models.log import Log
from Models.logistics import Logistics
from Models.medical_notes_access_log import MedicalNotesAccessLog
from Models.notification import Notification
from Models.personal_packing_item import PersonalPackingItem
from Models.place import Place
from Models.place_category import PlaceCategory
from Models.point import Point
from Models.point_has_image import PointHasImage
from Models.position_ping import PositionPing
from Models.processed_mutation import ProcessedMutation
from Models.requirement_contribution import RequirementContribution
from Models.satellite_feed import SatelliteFeed
from Models.sea import Sea
from Models.sea_state import SeaState
from Models.session import Session as DeviceSession
from Models.shuttle_passenger import ShuttlePassenger
from Models.shuttle_vehicle import ShuttleVehicle
from Models.sync_tombstone import SyncTombstone
from Models.tidal_station import TidalStation
from Models.tidal_stream_entry import TidalStreamEntry
from Models.travel_document import TravelDocument
from Models.trip import Trip
from Models.trip_member import TripMember
from Models.trip_requirement import TripRequirement
from Models.user import User
from Models.user_certification import UserCertification
from Models.weather import Weather
from Models.weather_state import WeatherState
from Models.wind_diamond import WindDiamond
from Services.trip_change_service import TripChange, TripChangeService

logger = logging.getLogger(__name__)

_COLLECTED_KEY = "trip_changes_collected"

Resolver = Callable[[Connection, Any], Optional[UUID]]


def _scalar(connection: Connection, statement: Executable) -> Optional[UUID]:
    return connection.execute(statement).scalar()


def _own_id(connection: Connection, trip: Trip) -> Optional[UUID]:
    return trip.id


def _trip_id_column(connection: Connection, instance: Any) -> Optional[UUID]:
    return instance.trip_id


def _via_itinerary_id(connection: Connection, instance: Any) -> Optional[UUID]:
    if instance.itinerary_id is None:
        return None
    return _scalar(
        connection,
        select(Itinerary.__table__.c.trip_id).where(Itinerary.__table__.c.id == instance.itinerary_id),
    )


def _day_trip_id(connection: Connection, day: Day) -> Optional[UUID]:
    return _via_itinerary_id(connection, day)


def _point_trip_id(connection: Connection, point: Point) -> Optional[UUID]:
    if point.day_id is None:
        return None
    return _scalar(
        connection,
        select(Itinerary.__table__.c.trip_id)
        .select_from(
            Day.__table__.join(Itinerary.__table__, Day.__table__.c.itinerary_id == Itinerary.__table__.c.id)
        )
        .where(Day.__table__.c.id == point.day_id),
    )


def _image_trip_id(connection: Connection, image: Image) -> Optional[UUID]:
    link = PointHasImage
    return _scalar(
        connection,
        select(Itinerary.__table__.c.trip_id)
        .select_from(
            link.join(Point.__table__, link.c.point_id == Point.__table__.c.id)
            .join(Day.__table__, Point.__table__.c.day_id == Day.__table__.c.id)
            .join(Itinerary.__table__, Day.__table__.c.itinerary_id == Itinerary.__table__.c.id)
        )
        .where(link.c.image_id == image.id)
        .limit(1),
    )


def _inventory_trip_id(connection: Connection, inventory_id: UUID) -> Optional[UUID]:
    return _scalar(
        connection,
        select(Inventory.__table__.c.trip_id).where(Inventory.__table__.c.id == inventory_id),
    )


def _requirement_trip_id(connection: Connection, requirement: TripRequirement) -> Optional[UUID]:
    return _inventory_trip_id(connection, requirement.inventory_id)


def _contribution_trip_id(connection: Connection, contribution: RequirementContribution) -> Optional[UUID]:
    inventory_id = _scalar(
        connection,
        select(TripRequirement.__table__.c.inventory_id).where(
            TripRequirement.__table__.c.id == contribution.requirement_id
        ),
    )
    if inventory_id is None:
        return None
    return _inventory_trip_id(connection, inventory_id)


def _member_trip_id(connection: Connection, instance: Any) -> Optional[UUID]:
    return _scalar(
        connection,
        select(TripMember.__table__.c.trip_id).where(TripMember.__table__.c.id == instance.trip_member_id),
    )


def _passenger_trip_id(connection: Connection, passenger: ShuttlePassenger) -> Optional[UUID]:
    return _scalar(
        connection,
        select(ShuttleVehicle.__table__.c.trip_id).where(ShuttleVehicle.__table__.c.id == passenger.vehicle_id),
    )


TRIP_SCOPED_RESOLVERS: dict[type, Resolver] = {
    Trip: _own_id,
    TripMember: _trip_id_column,
    Invitation: _trip_id_column,
    Itinerary: _trip_id_column,
    Day: _day_trip_id,
    Point: _point_trip_id,
    Image: _image_trip_id,
    Place: _via_itinerary_id,
    WindDiamond: _via_itinerary_id,
    TidalStation: _via_itinerary_id,
    Inventory: _trip_id_column,
    TripRequirement: _requirement_trip_id,
    RequirementContribution: _contribution_trip_id,
    PersonalPackingItem: _member_trip_id,
    Logistics: _trip_id_column,
    ShuttleVehicle: _trip_id_column,
    ShuttlePassenger: _passenger_trip_id,
    TravelDocument: _trip_id_column,
}

EXCLUDED_MODELS: dict[type, str] = {
    PositionPing: "streamed by M8's own channel; would flood this one",
    SyncTombstone: "sync bookkeeping, not user-visible state",
    ProcessedMutation: "sync bookkeeping, not user-visible state",
    Weather: "Celery-written forecast cache; the weather panel carries its own freshness label",
    Sea: "Celery-written forecast cache; the sea panel carries its own freshness label",
    WeatherState: "Celery-written forecast cache",
    SeaState: "Celery-written forecast cache",
    TidalStreamEntry: "child rows of a TidalStation, which is what is published",
    AuthToken: "per-user credential, not trip state",
    DeviceSession: "per-user credential, not trip state",
    User: "per-user, no trip audience",
    Log: "per-user paddling record, no trip audience",
    UserCertification: "per-user, no trip audience",
    EndorsementRequest: "per-user, no trip audience",
    Block: "per-user, no trip audience",
    PaddlerConnection: "per-user, no trip audience",
    Notification: "per-user inbox, no trip audience; read through the pending-requests summary",
    SatelliteFeed: "per-user profile setting, not trip-scoped",
    Item: "per-user gear; a trip sees it through TripRequirement/RequirementContribution",
    ItemCategory: "global reference data",
    CatalogItem: "global reference data",
    PlaceCategory: "global reference data",
    MedicalNotesAccessLog: "medical notes are parked (M24); nothing about them may ride this channel",
}


QUIET_COLUMNS: dict[type, frozenset[str]] = {
    Trip: frozenset({"last_accessed_at"}),
}
"""Columns whose change, alone, is bookkeeping rather than something a viewer could see.

`Trip.last_accessed_at` is written by every `GET /trip/<id>`; published, each viewer's refresh
would re-read the trip, write it again and publish again, indefinitely."""


def _only_quiet_columns_changed(instance: Any) -> bool:
    quiet = QUIET_COLUMNS.get(type(instance))
    if quiet is None:
        return False
    changed = {attribute.key for attribute in inspect(instance).attrs if attribute.history.has_changes()}
    return changed <= quiet


def _collected(session: Session) -> set[tuple[UUID, str, UUID, str]]:
    return session.info.setdefault(_COLLECTED_KEY, set())


def _record(session: Session, connection: Connection, instance: Any, operation: str) -> None:
    resolver = TRIP_SCOPED_RESOLVERS.get(type(instance))
    if resolver is None:
        return
    try:
        trip_id = resolver(connection, instance)
    except Exception as error:
        logger.warning(
            "trip_change_unresolvable",
            extra={"table": instance.__table__.name, "record_id": str(instance.id), "error": str(error)},
        )
        return
    if trip_id is None:
        return
    _collected(session).add((trip_id, instance.__table__.name, instance.id, operation))


@event.listens_for(Session, "before_flush")
def _collect_deletes(session: Session, flush_context: UOWTransaction, instances: Optional[Any]) -> None:
    connection = session.connection()
    for instance in list(session.deleted):
        _record(session, connection, instance, "delete")


@event.listens_for(Session, "after_flush")
def _collect_creates_and_updates(session: Session, flush_context: UOWTransaction) -> None:
    connection = session.connection()
    for instance in list(session.new):
        _record(session, connection, instance, "create")
    for instance in list(session.dirty):
        if session.is_modified(instance, include_collections=False) and not _only_quiet_columns_changed(instance):
            _record(session, connection, instance, "update")


@event.listens_for(Session, "after_commit")
def _publish_collected(session: Session) -> None:
    collected = session.info.pop(_COLLECTED_KEY, None)
    if not collected:
        return
    changes_by_trip: dict[UUID, list[TripChange]] = defaultdict(list)
    for trip_id, table, record_id, operation in collected:
        changes_by_trip[trip_id].append(TripChange(table, record_id, operation))
    for trip_id, changes in changes_by_trip.items():
        TripChangeService.publish(trip_id, changes)


@event.listens_for(Session, "after_rollback")
def _discard_collected(session: Session) -> None:
    session.info.pop(_COLLECTED_KEY, None)
