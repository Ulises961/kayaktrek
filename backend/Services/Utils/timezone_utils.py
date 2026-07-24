from datetime import date, datetime, time, timedelta, timezone
from functools import lru_cache
from typing import TYPE_CHECKING, Optional, Tuple
from zoneinfo import ZoneInfo

from timezonefinder import TimezoneFinder

if TYPE_CHECKING:
    from Models.trip import Trip


@lru_cache(maxsize=1)
def _finder() -> TimezoneFinder:
    return TimezoneFinder()


def resolve_timezone(latitude: float, longitude: float) -> Optional[str]:
    """IANA timezone name for a WGS-84 coordinate, or None if it can't be resolved
    (e.g. open ocean, far from any timezone polygon)."""
    return _finder().timezone_at(lat=latitude, lng=longitude)


def trip_today(trip: "Trip") -> date:
    """Today's date in the trip's resolved timezone, falling back to UTC when unresolved."""
    if trip.timezone_name is None:
        return datetime.now(timezone.utc).date()
    return datetime.now(ZoneInfo(trip.timezone_name)).date()


def day_bounds_utc(trip: "Trip", day_date: date) -> Tuple[datetime, datetime]:
    """UTC [start, end) instants spanning midnight-to-midnight of `day_date` in the
    trip's resolved timezone (falling back to UTC when unresolved) — used to bucket
    UTC-stamped PositionPing rows into a trip-local calendar day."""
    tz = ZoneInfo(trip.timezone_name) if trip.timezone_name else timezone.utc
    start_local = datetime.combine(day_date, time.min, tzinfo=tz)
    end_local = start_local + timedelta(days=1)
    return start_local.astimezone(timezone.utc), end_local.astimezone(timezone.utc)
