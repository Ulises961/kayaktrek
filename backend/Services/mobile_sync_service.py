"""Mobile sync-down for the tables that fit WatermelonDB's flat per-row model —
everything EXCEPT the route (docs/mobile/sync-protocol-spec.md §4's per-row
aggregates: trip_members, requirement_contributions; and the per-day weather/sea
cache). The route (days + points) is deliberately not here — it syncs through its
own atomic whole-subtree channel, ItineraryRouteSyncService, because a per-row
delta cannot hold its chain invariant (§7.1).

`pullChanges` naming and shape follow WatermelonDB's own sync contract (§2):
`{ <table>: { created, updated, deleted } }`, deletions as IDs only (server-side
tombstones fill the gap SyncTombstone was built for — §5). Sync-up is not here:
changes made on the phone arrive through the mutation queue
(Services/mutation_queue_service.py).
"""
import logging
from datetime import datetime, timezone
from typing import Dict, List, Optional
from uuid import UUID

from sqlalchemy import or_
from sqlalchemy.orm import Query

from Api.database import db
from Models.day import Day
from Models.inventory import Inventory
from Models.itinerary import Itinerary
from Models.requirement_contribution import RequirementContribution
from Models.sea import Sea
from Models.sync_tombstone import SyncTombstone
from Models.trip import Trip
from Models.trip_member import TripMember
from Models.trip_requirement import TripRequirement
from Models.weather import Weather
from Services.tidal_service import VELOCITY_GRID_RESOLUTION, TidalService

logger = logging.getLogger(__name__)


def _epoch_ms(value: Optional[datetime]) -> Optional[int]:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return int(value.timestamp() * 1000)


def _cutoff_from_epoch_ms(last_pulled_at: Optional[int]) -> Optional[datetime]:
    if last_pulled_at is None:
        return None
    return datetime.fromtimestamp(last_pulled_at / 1000, tz=timezone.utc)


def _bucket(rows: List[dict], is_initial_sync: bool) -> Dict[str, List[dict]]:
    """WatermelonDB distinguishes created vs updated; the server can't always
    know which a device has already seen, so an initial sync (no lastPulledAt)
    puts everything in `created` and a delta sync puts everything live in
    `updated` — applying an "updated" record the device has never seen is a
    plain insert to WatermelonDB either way, so this is safe, not just
    convenient."""
    return {"created": rows, "updated": [], "deleted": []} if is_initial_sync else {
        "created": [], "updated": rows, "deleted": [],
    }


def _deleted_ids(trip_id: UUID, table_name: str, cutoff: Optional[datetime]) -> List[str]:
    if cutoff is None:
        # Nothing to reconcile on a first sync — the device has never seen any
        # of these rows, so their deletion is not news.
        return []
    tombstones = (
        db.session.query(SyncTombstone)
        .filter(
            SyncTombstone.trip_id == trip_id,
            SyncTombstone.table_name == table_name,
            SyncTombstone.created > cutoff,
        )
        .all()
    )
    return [str(t.record_id) for t in tombstones]


class MobileSyncService:
    @staticmethod
    def pull_changes(trip_id: str, last_pulled_at: Optional[int]) -> dict:
        trip_uuid = UUID(trip_id)
        cutoff = _cutoff_from_epoch_ms(last_pulled_at)
        is_initial = cutoff is None

        # Captured BEFORE any query runs, not after. A write committed while
        # this request is in flight must land at-or-after this snapshot, so
        # the NEXT pull (whose cutoff is this timestamp) is guaranteed to see
        # it. Capturing it after the queries would let a mid-request write
        # slip in with updated < the returned timestamp — invisible to every
        # future pull's `updated > cutoff` filter, permanently, not just late.
        snapshot_timestamp = datetime.now(timezone.utc)

        # Bumps the weather-fetch beat tasks' attention gate (docs/adr/features.md
        # §1a) — a pullChanges call is always a real foreground/reconnect event
        # (mobile has no periodic background poll, docs/adr/mobile-offline.md), so
        # this never fires from an automated ping with nobody actually looking.
        db.session.query(Trip).filter(Trip.id == trip_uuid).update(
            {Trip.last_accessed_at: snapshot_timestamp.replace(tzinfo=None)}
        )
        db.session.commit()

        changes = {
            "trip_members": _bucket(
                MobileSyncService._live_trip_members(trip_uuid, cutoff), is_initial
            ) | {"deleted": _deleted_ids(trip_uuid, "trip_member", cutoff)},
            "requirement_contributions": _bucket(
                MobileSyncService._live_requirement_contributions(trip_uuid, cutoff), is_initial
            ) | {"deleted": _deleted_ids(trip_uuid, "requirement_contribution", cutoff)},
            "weather": _bucket(
                MobileSyncService._live_weather(trip_uuid, cutoff), is_initial
            ) | {"deleted": _deleted_ids(trip_uuid, "weather", cutoff)},
            "weather_states": _bucket(
                MobileSyncService._live_weather_states(trip_uuid, cutoff), is_initial
            ) | {"deleted": []},  # states have no independent tombstone; the parent's covers them
            "sea": _bucket(
                MobileSyncService._live_sea(trip_uuid, cutoff), is_initial
            ) | {"deleted": _deleted_ids(trip_uuid, "sea", cutoff)},
            "sea_states": _bucket(
                MobileSyncService._live_sea_states(trip_uuid, cutoff), is_initial
            ) | {"deleted": []},
            # Always sent whole, whatever the cutoff: the box comes from the route's points,
            # which have no tombstones and no per-row delta, and a day's rows are about 5 KB
            # (a few hundred bytes gzipped) that apply idempotently. Nothing is ever deleted — a day with no data keeps
            # null hours rather than losing them.
            "velocity_days": _bucket(
                MobileSyncService._live_velocity_days(trip_uuid), is_initial
            ) | {"deleted": []},
            "velocity_hours": _bucket(
                MobileSyncService._live_velocity_hours(trip_uuid), is_initial
            ) | {"deleted": []},
        }
        return {"changes": changes, "timestamp": _epoch_ms(snapshot_timestamp)}

    @staticmethod
    def _live_trip_members(trip_id: UUID, cutoff: Optional[datetime]) -> List[dict]:
        query = db.session.query(TripMember).filter(TripMember.trip_id == trip_id)
        if cutoff is not None:
            query = query.filter(TripMember.updated > cutoff)
        return [
            {
                "id": str(member.id),
                "tripId": str(member.trip_id),
                "userId": str(member.user_id),
                # Carried so an offline float-plan crew manifest can attribute a
                # vessel/emergency contact to a name, not just an opaque userId.
                "userName": member.user.name,
                "userSurname": member.user.surname,
                "userUsername": member.user.username,
                "role": member.role.value,
                "nominatedSuccessor": member.nominated_successor,
                "vesselMake": member.vessel_make,
                "vesselModel": member.vessel_model,
                "vesselLengthCm": member.vessel_length_cm,
                "vesselColorPrimary": member.vessel_color_primary,
                "vesselColorSecondary": member.vessel_color_secondary,
                "emergencyContactName": member.emergency_contact_name,
                "emergencyContactPhone": member.emergency_contact_phone,
                "emergencyContactRelationship": member.emergency_contact_relationship,
                "floatPlanConfirmedAt": _epoch_ms(member.float_plan_confirmed_at),
                "leftAt": _epoch_ms(member.left_at),
                "leftNote": member.left_note,
            }
            for member in query.all()
        ]

    @staticmethod
    def _live_requirement_contributions(trip_id: UUID, cutoff: Optional[datetime]) -> List[dict]:
        query = (
            db.session.query(RequirementContribution)
            .join(TripRequirement, RequirementContribution.requirement_id == TripRequirement.id)
            .join(Inventory, TripRequirement.inventory_id == Inventory.id)
            .filter(Inventory.trip_id == trip_id)
        )
        if cutoff is not None:
            query = query.filter(RequirementContribution.updated > cutoff)
        return [
            {
                "id": str(contribution.id),
                "requirementId": str(contribution.requirement_id),
                "tripMemberId": str(contribution.trip_member_id),
                "itemId": str(contribution.item_id),
                "checked": contribution.checked,
            }
            for contribution in query.all()
        ]

    @staticmethod
    def _weather_query(trip_id: UUID, cutoff: Optional[datetime]) -> Query[Weather]:
        query = (
            db.session.query(Weather)
            .join(Day, Weather.day_id == Day.id)
            .join(Itinerary, Day.itinerary_id == Itinerary.id)
            .filter(Itinerary.trip_id == trip_id)
        )
        if cutoff is not None:
            query = query.filter(Weather.fetched_at > cutoff)
        return query

    @staticmethod
    def _live_weather(trip_id: UUID, cutoff: Optional[datetime]) -> List[dict]:
        return [
            {
                "id": str(weather.day_id),
                "dayId": str(weather.day_id),
                "model": weather.model,
                "fetchedAt": _epoch_ms(weather.fetched_at),
            }
            for weather in MobileSyncService._weather_query(trip_id, cutoff).all()
        ]

    @staticmethod
    def _live_weather_states(trip_id: UUID, cutoff: Optional[datetime]) -> List[dict]:
        rows: List[dict] = []
        for weather in MobileSyncService._weather_query(trip_id, cutoff).all():
            for state in weather.weather_states:
                rows.append({
                    # Stable across refetches (§6.2) — a WeatherState has no surrogate
                    # id of its own, so the composite natural key IS the sync id.
                    "id": f"{weather.day_id}:{state.time}",
                    "dayId": str(weather.day_id),
                    "time": state.time.isoformat(),
                    "temperature": float(state.temperature) if state.temperature is not None else None,
                    "precipitation": float(state.precipitation) if state.precipitation is not None else None,
                    "windDirection": float(state.wind_direction) if state.wind_direction is not None else None,
                    "windForce": float(state.wind_force) if state.wind_force is not None else None,
                    "cloud": state.cloud,
                })
        return rows

    @staticmethod
    def _velocity_days(trip_id: UUID) -> List[Day]:
        """The trip's days that have weather or sea data, in day order."""
        return (
            db.session.query(Day)
            .join(Itinerary, Day.itinerary_id == Itinerary.id)
            .filter(Itinerary.trip_id == trip_id, or_(Day.weather.has(), Day.sea.has()))
            .order_by(Day.day_number)
            .all()
        )

    @staticmethod
    def _live_velocity_days(trip_id: UUID) -> List[dict]:
        """Per day, what the phone needs to rebuild the wind-vectors / wave-vectors grid for
        any hour: the box, the grid size and the land mask ("1" where a cell is land, flat and
        row-major from the NW corner, as the endpoints null it). The phone stamps a (u, v) over
        the grid and, for waves only, nulls the land cells."""
        rows: List[dict] = []
        for day in MobileSyncService._velocity_days(trip_id):
            bounding_box = TidalService.day_bounding_box(day)
            lat_min, lat_max, lon_min, lon_max = bounding_box
            land = TidalService.velocity_land_mask(bounding_box)
            rows.append({
                "id": str(day.id),
                "dayId": str(day.id),
                "south": lat_min,
                "north": lat_max,
                "west": lon_min,
                "east": lon_max,
                "size": VELOCITY_GRID_RESOLUTION,
                "landMask": "".join("1" if is_land else "0" for is_land in land),
            })
        return rows

    @staticmethod
    def _live_velocity_hours(trip_id: UUID) -> List[dict]:
        """Per day, one row for every hour 0-23 with the wind and wave (u, v) the endpoints
        would stamp for it — null when the day has no usable state. Every hour is sent so a
        stale one on the phone is overwritten, not kept."""
        rows: List[dict] = []
        for day in MobileSyncService._velocity_days(trip_id):
            weather_states = day.weather.weather_states if day.weather else []
            sea_states = day.sea.sea_states if day.sea else []
            for hour in range(24):
                wind = TidalService.wind_flow_at_hour(weather_states, hour)
                wave = TidalService.wave_flow_at_hour(sea_states, hour)
                rows.append({
                    "id": f"{day.id}:{hour}",
                    "dayId": str(day.id),
                    "hour": hour,
                    "windU": wind[0] if wind else None,
                    "windV": wind[1] if wind else None,
                    "waveU": wave[0] if wave else None,
                    "waveV": wave[1] if wave else None,
                })
        return rows

    @staticmethod
    def _sea_query(trip_id: UUID, cutoff: Optional[datetime]) -> Query[Sea]:
        query = (
            db.session.query(Sea)
            .join(Day, Sea.day_id == Day.id)
            .join(Itinerary, Day.itinerary_id == Itinerary.id)
            .filter(Itinerary.trip_id == trip_id)
        )
        if cutoff is not None:
            query = query.filter(Sea.recorded_at > cutoff)
        return query

    @staticmethod
    def _live_sea(trip_id: UUID, cutoff: Optional[datetime]) -> List[dict]:
        return [
            {
                "id": str(sea.day_id),
                "dayId": str(sea.day_id),
                "moonPhase": sea.moon_phase,
                "highTide": sea.high_tide.isoformat() if sea.high_tide else None,
                "lowTide": sea.low_tide.isoformat() if sea.low_tide else None,
                "tidalRangeM": sea.tidal_range_m,
                "tidalSource": sea.tidal_source,
                "recordedAt": _epoch_ms(sea.recorded_at),
            }
            for sea in MobileSyncService._sea_query(trip_id, cutoff).all()
        ]

    @staticmethod
    def _live_sea_states(trip_id: UUID, cutoff: Optional[datetime]) -> List[dict]:
        rows: List[dict] = []
        for sea in MobileSyncService._sea_query(trip_id, cutoff).all():
            for state in sea.sea_states:
                rows.append({
                    "id": f"{sea.day_id}:{state.time}",
                    "dayId": str(sea.day_id),
                    "time": state.time.isoformat(),
                    "waveHeight": state.wave_height,
                    "waveDirection": state.wave_direction,
                    "swellWaveHeight": state.swell_wave_height,
                    "swellDirection": state.swell_direction,
                    "swellPeriod": state.swell_period,
                    "currentSpeed": state.current_speed,
                    "currentDirection": state.current_direction,
                })
        return rows
