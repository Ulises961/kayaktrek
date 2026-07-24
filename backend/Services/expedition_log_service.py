"""
Expedition Log Service - auto-generates a per-member Log from live GPS pings
(and, as a fallback, the itinerary's recorded route) for a trip-local day.

See ADR-021 (docs/adr/features.md) and M8 §8.2.
"""
import logging
from datetime import date, timedelta
from typing import List, Optional, Tuple
from uuid import UUID

from sqlalchemy.orm import selectinload

from Api.database import db
from Models.day import Day
from Models.log import Log
from Models.position_ping import PositionPing
from Models.sea import Sea
from Models.trip import Trip, TripStateType
from Services.Utils.geo_utils import haversine_km
from Services.Utils.point_ordering import walk_linked_list
from Services.Utils.timezone_utils import day_bounds_utc, trip_today

logger = logging.getLogger(__name__)

_MIN_PINGS_FOR_TRACK = 3
_MAX_PING_GAP = timedelta(hours=2)

# WMO sea-state code — probable wave-height lower bound (m) → Beaufort force.
_BEAUFORT_WAVE_THRESHOLDS_M = (
    (0.0, 0), (0.1, 1), (0.2, 2), (0.6, 3), (1.0, 4), (2.0, 5),
    (3.0, 6), (4.0, 7), (5.5, 8), (7.0, 9), (9.0, 10), (11.5, 11), (14.0, 12),
)


class ExpeditionLogService:
    """Auto-generation of Log rows from live-expedition data."""

    @staticmethod
    def generate_day_log(trip_id: str, user_id: str, day_date: date) -> Optional[Log]:
        """Generate (and persist) an auto Log for one member's trip-local day.

        Idempotent: returns None without side effects if a Log already exists
        for (user, trip, date). A stub Log (all-null distance/hours/avg_sea) is
        still created when neither GPS pings nor itinerary data are available —
        the record has standalone value as a placeholder the user can fill in.
        """
        existing = (
            db.session.query(Log)
            .filter(Log.trip_id == UUID(trip_id), Log.user_id == UUID(user_id), Log.date == day_date)
            .first()
        )
        if existing is not None:
            return None

        trip = db.session.get(Trip, UUID(trip_id))
        if trip is None:
            logger.warning("expedition_log_trip_not_found", extra={"trip_id": trip_id})
            return None

        start_utc, end_utc = day_bounds_utc(trip, day_date)
        pings = (
            db.session.query(PositionPing)
            .filter(
                PositionPing.trip_id == UUID(trip_id),
                PositionPing.user_id == UUID(user_id),
                PositionPing.recorded_at >= start_utc,
                PositionPing.recorded_at < end_utc,
            )
            .order_by(PositionPing.recorded_at)
            .all()
        )

        day = _find_day(trip, day_date)

        distance_km = _mileage_from_pings(pings)
        if distance_km is None:
            distance_km = _mileage_from_itinerary_day(day)

        hours = None
        if pings:
            hours = round((pings[-1].recorded_at - pings[0].recorded_at).total_seconds() / 3600, 2)

        log = Log(
            user_id=UUID(user_id),
            trip_id=UUID(trip_id),
            date=day_date,
            distance=distance_km,
            hours=hours,
            avg_sea=_avg_sea_beaufort(day),
            route_geojson=_route_geojson(pings),
            source="auto",
        )
        db.session.add(log)
        db.session.commit()
        logger.info(
            "expedition_log_generated",
            extra={"trip_id": trip_id, "user_id": user_id, "date": str(day_date), "ping_count": len(pings)},
        )
        return log

    @staticmethod
    def close_day(trip_id: str, day_date: Optional[date] = None) -> date:
        """Validate that a trip's day can be closed and return the resolved date
        (the caller dispatches `generate_trip_day_logs` for it — dispatch is a
        Resource-layer concern, matching `trigger_weather_fetch`'s convention).

        Raises ValueError('trip_not_happening') if the trip isn't currently
        happening, or ValueError('no_day_for_date') if it has no Day scheduled
        for the resolved date.
        """
        trip = db.session.get(Trip, UUID(trip_id))
        if trip is None or trip.state != TripStateType.HAPPENING:
            raise ValueError("trip_not_happening")

        resolved_date = day_date or trip_today(trip)
        if _find_day(trip, resolved_date) is None:
            raise ValueError("no_day_for_date")
        return resolved_date


def _find_day(trip: Trip, day_date: date) -> Optional[Day]:
    if trip.itinerary is None:
        return None
    return (
        db.session.query(Day)
        .filter(Day.itinerary_id == trip.itinerary.id, Day.date == day_date)
        .options(selectinload(Day.points), selectinload(Day.sea).selectinload(Sea.sea_states))
        .first()
    )


def _mileage_from_pings(pings: List[PositionPing]) -> Optional[float]:
    if len(pings) < _MIN_PINGS_FOR_TRACK:
        return None
    for earlier, later in zip(pings, pings[1:]):
        if later.recorded_at - earlier.recorded_at > _MAX_PING_GAP:
            return None
    return sum(
        haversine_km(earlier.lat, earlier.lon, later.lat, later.lon)
        for earlier, later in zip(pings, pings[1:])
    )


def _mileage_from_itinerary_day(day: Optional[Day]) -> Optional[float]:
    if day is None:
        return None
    points = day.points or []
    point_map = {str(point.id): point for point in points}
    ordered = [point_map[point_id] for point_id in walk_linked_list(points)]
    # Coordinates converted to floats inside the comprehension, where mypy's None-narrowing
    # of the `if` guard still applies to `point.latitude`/`point.longitude` — it does not
    # carry over to a later re-access of the same attributes on the filtered elements.
    placed: List[Tuple[float, float]] = [
        (float(point.latitude), float(point.longitude))
        for point in ordered
        if point.latitude is not None and point.longitude is not None
    ]
    if len(placed) < 2:
        return None
    return sum(
        haversine_km(earlier[0], earlier[1], later[0], later[1])
        for earlier, later in zip(placed, placed[1:])
    )


def _avg_sea_beaufort(day: Optional[Day]) -> Optional[int]:
    if day is None or day.sea is None:
        return None
    heights = [float(state.wave_height) for state in day.sea.sea_states if state.wave_height is not None]
    if not heights:
        return None
    return _beaufort_from_wave_height(sum(heights) / len(heights))


def _beaufort_from_wave_height(wave_height_m: float) -> int:
    force = 0
    for threshold, beaufort in _BEAUFORT_WAVE_THRESHOLDS_M:
        if wave_height_m >= threshold:
            force = beaufort
        else:
            break
    return force


def _route_geojson(pings: List[PositionPing]) -> Optional[dict]:
    if not pings:
        return None
    return {
        "type": "LineString",
        "coordinates": [[ping.lon, ping.lat] for ping in pings],
    }
