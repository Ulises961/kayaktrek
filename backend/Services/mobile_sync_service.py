"""Mobile sync-down/up for the tables that fit WatermelonDB's flat per-row
model — everything EXCEPT the route (docs/mobile/sync-protocol-spec.md §4's
per-row aggregates: trip_members, requirement_contributions; and the per-day
weather/sea cache). The route (days + points) is deliberately not here — it
syncs through its own atomic whole-subtree channel, ItineraryRouteSyncService
(WP1 item 7), because a per-row delta cannot hold its chain invariant (§7.1).

`pullChanges`/`pushChanges` naming and shape follow WatermelonDB's own sync
contract (§2): `{ <table>: { created, updated, deleted } }`, deletions as IDs
only (server-side tombstones fill the gap SyncTombstone was built for — §5).
"""
import logging
from datetime import datetime, timezone
from typing import Dict, List, Optional
from uuid import UUID

from sqlalchemy.exc import NoResultFound

from Api.database import db
from Models.inventory import Inventory
from Models.item import Item, ItemStatusType
from Models.requirement_contribution import RequirementContribution
from Models.sea import Sea
from Models.sync_tombstone import SyncTombstone
from Models.trip_member import TripMember
from Models.trip_requirement import TripRequirement
from Models.weather import Weather
from Schemas.base_schema import camelcase

logger = logging.getLogger(__name__)

# Never role, user_id, trip_id, or any medical_notes_* field — those are never
# device-writable, and medical notes stay out of this sync surface entirely
# while the feature is parked (M24; docs/mobile/sync-protocol-spec.md §11).
_TRIP_MEMBER_MUTABLE = frozenset({
    "vessel_make", "vessel_model", "vessel_length_cm",
    "vessel_color_primary", "vessel_color_secondary",
    "emergency_contact_name", "emergency_contact_phone", "emergency_contact_relationship",
})


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
        }
        return {"changes": changes, "timestamp": int(datetime.now(timezone.utc).timestamp() * 1000)}

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
    def _weather_query(trip_id: UUID, cutoff: Optional[datetime]):
        from Models.day import Day
        from Models.itinerary import Itinerary

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
    def _sea_query(trip_id: UUID, cutoff: Optional[datetime]):
        from Models.day import Day
        from Models.itinerary import Itinerary

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

    # ------------------------------------------------------------------ #
    # push                                                                  #
    # ------------------------------------------------------------------ #

    @staticmethod
    def push_changes(trip_id: str, changes: dict, user_id: str) -> None:
        """Apply a device's pushed changes for its own trip_member row and its
        own requirement contributions.

        Weather/sea are read-only on the device (§6.4) — never accepted here.
        A device may only touch ITS OWN trip_member row and contributions;
        this is a straightforward apply, not the trip-state-gated device-wins
        policy the route channel needs (WP1 items 7-8) — that policy exists
        because the route's correctness is global (§7.1), which is not true
        of these per-row tables (§4).
        """
        if changes.get("weather") or changes.get("sea") or changes.get("weather_states") or changes.get("sea_states"):
            raise ValueError("weather and sea are read-only and must not be pushed")

        trip_uuid = UUID(trip_id)
        user_uuid = UUID(user_id)

        own_member = (
            db.session.query(TripMember)
            .filter_by(trip_id=trip_uuid, user_id=user_uuid)
            .one_or_none()
        )
        if own_member is None:
            raise NoResultFound("Caller is not a member of this trip")

        MobileSyncService._apply_trip_member_changes(
            changes.get("trip_members", {}), own_member
        )
        MobileSyncService._apply_requirement_contribution_changes(
            changes.get("requirement_contributions", {}), own_member
        )
        db.session.commit()

    @staticmethod
    def _apply_trip_member_changes(table_changes: dict, own_member: TripMember) -> None:
        if table_changes.get("created") or table_changes.get("deleted"):
            raise ValueError("trip_members can only be updated via mobile sync, not created or deleted")

        for record in table_changes.get("updated", []):
            if str(record.get("id")) != str(own_member.id):
                raise PermissionError("Cannot push changes to another member's row")
            for field in _TRIP_MEMBER_MUTABLE:
                key = camelcase(field)
                if key in record:
                    setattr(own_member, field, record[key])

    @staticmethod
    def _apply_requirement_contribution_changes(table_changes: dict, own_member: TripMember) -> None:
        for record in table_changes.get("created", []):
            requirement_id = record.get("requirementId")
            item_id = record.get("itemId")
            if not requirement_id or not item_id:
                raise ValueError("requirementId and itemId are required")
            item = db.session.get(Item, UUID(item_id))
            if item is None or item.status != ItemStatusType.OWNED:
                raise ValueError("Only owned items can be contributed")
            existing = db.session.query(RequirementContribution).filter_by(
                requirement_id=UUID(requirement_id), trip_member_id=own_member.id
            ).first()
            if existing is not None:
                raise ValueError("Already contributing to this requirement")
            db.session.add(RequirementContribution(
                requirement_id=UUID(requirement_id),
                trip_member_id=own_member.id,
                item_id=UUID(item_id),
            ))

        for record in table_changes.get("updated", []):
            contribution = db.session.get(RequirementContribution, UUID(record["id"]))
            if contribution is None or contribution.trip_member_id != own_member.id:
                raise PermissionError("Cannot push changes to another member's contribution")
            if "checked" in record:
                contribution.checked = bool(record["checked"])

        for record_id in table_changes.get("deleted", []):
            contribution = db.session.get(RequirementContribution, UUID(record_id))
            if contribution is None:
                continue
            if contribution.trip_member_id != own_member.id:
                raise PermissionError("Cannot delete another member's contribution")
            db.session.delete(contribution)
