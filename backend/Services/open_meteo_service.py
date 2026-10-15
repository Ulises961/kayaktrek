import logging
import os
from datetime import datetime, timezone

import numpy as np
import openmeteo_requests
import requests
from retry_requests import retry

from Api.cache import cache

logger = logging.getLogger(__name__)

# Open-Meteo's free tier is scoped to non-commercial use regardless of call volume, and this
# app counts as commercial the moment any premium feature (weather refresh, extended
# forecast — both PremiumEntitlementService stubs, closed by default) is real, not only
# once someone is paying. Unset (the default) keeps the free-tier hosts; setting
# OPEN_METEO_WEATHER_BASE_URL/OPEN_METEO_MARINE_BASE_URL to `customer-api.open-meteo.com`'s
# endpoints plus OPEN_METEO_API_KEY switches to the paid API Standard plan — a config change
# only. Read with `or`, not a get() default: compose passes an unset variable as an empty
# string, and blank has to mean the free tier too. See docs/adr/features.md §1a.
_WEATHER_URL = os.environ.get("OPEN_METEO_WEATHER_BASE_URL") or "https://api.open-meteo.com/v1/forecast"
_MARINE_URL = os.environ.get("OPEN_METEO_MARINE_BASE_URL") or "https://marine-api.open-meteo.com/v1/marine"
_API_KEY = os.environ.get("OPEN_METEO_API_KEY") or None

# Per-day forecast cache: long enough to dedupe identical coordinate/date calls
# within one beat sweep, short enough that the next 6h sweep refetches instead of
# re-reading the previous sweep's result.
_FORECAST_CACHE_TTL_SECONDS = 60 * 60

# Global background grid: 10° resolution, -80→80°N, -170→170°E = 17×35 = 595 points.
_GLOBAL_LAT_STEP = 10
_GLOBAL_LON_STEP = 10
_GLOBAL_LATS = list(range(-80, 81, _GLOBAL_LAT_STEP))   # 17 values, south→north
_GLOBAL_LONS = list(range(-170, 171, _GLOBAL_LON_STEP))  # 35 values, west→east

_WEATHER_VARS = [
    "temperature_2m",
    "precipitation",
    "wind_speed_10m",
    "wind_direction_10m",
    "cloud_cover",
]
_MARINE_VARS = [
    "wave_height",
    "wave_direction",
    "wave_period",
    "swell_wave_height",
    "swell_wave_direction",
    "swell_wave_period",
    "ocean_current_velocity",
    "ocean_current_direction",
]


def _with_api_key(params: dict) -> dict:
    if _API_KEY:
        return {**params, "apikey": _API_KEY}
    return params


def _make_client() -> openmeteo_requests.Client:
    session = retry(requests.Session(), retries=3, backoff_factor=0.5)
    return openmeteo_requests.Client(session=session)


def _float_or_none(val: float) -> float | None:
    return None if np.isnan(val) else float(val)


_HOURS_PER_DAY = 24


def _reindex_to_hourly_grid(records: list[dict], var_names: list[str]) -> list[dict]:
    """Guarantee a full, fixed 24-hour grid (00:00..23:00), regardless of how
    many hourly records the upstream API actually returned.

    _upsert_weather/_upsert_sea (Tasks/weather_fetch_task.py) delete and
    recreate the WHOLE state set on every refresh, keyed by the derived id
    f"{day_id}:{time}" (docs/mobile/sync-protocol-spec.md §6.2). The mobile
    sync channel writes no per-state tombstone for weather_states/sea_states
    (Services/mobile_sync_service.py — "the parent's covers them"), which is
    only actually safe if the set of times is stable across refetches. A
    canonical grid makes that a guarantee rather than a bet on OpenMeteo
    always returning the same 24 hours."""
    by_time = {record["time"]: record for record in records}
    grid = []
    for hour in range(_HOURS_PER_DAY):
        time_label = f"{hour:02d}:00"
        record = by_time.get(time_label)
        if record is None:
            record = {"time": time_label, **{name: None for name in var_names}}
        grid.append(record)
    return grid


def _parse_hourly(response, var_names: list[str]) -> list[dict]:
    hourly = response.Hourly()
    start_ts = hourly.Time()
    interval = hourly.Interval()
    arrays = [hourly.Variables(i).ValuesAsNumpy() for i in range(len(var_names))]
    n = len(arrays[0]) if arrays else 0

    records = []
    for i in range(n):
        t = datetime.fromtimestamp(start_ts + i * interval, tz=timezone.utc)
        record: dict[str, str | float | None] = {"time": t.strftime("%H:%M")}
        for j, name in enumerate(var_names):
            record[name] = _float_or_none(arrays[j][i])
        records.append(record)
    return _reindex_to_hourly_grid(records, var_names)


class OpenMeteoService:
    @staticmethod
    def fetch_weather(lat: float, lng: float, date_str: str, force_refresh: bool = False) -> list[dict]:
        cache_key = f"weather:{lat:.1f}:{lng:.1f}:{date_str}"
        if not force_refresh:
            cached = cache.get(cache_key)
            if cached is not None:
                logger.info("open_meteo_cache_hit", extra={"cache_key": cache_key})
                return cached

        client = _make_client()
        responses = client.weather_api(
            _WEATHER_URL,
            params=_with_api_key({
                "latitude": lat,
                "longitude": lng,
                "hourly": _WEATHER_VARS,
                "start_date": date_str,
                "end_date": date_str,
                "timezone": "UTC",
            }),
        )
        data = _parse_hourly(responses[0], _WEATHER_VARS)
        cache.set(cache_key, data, timeout=_FORECAST_CACHE_TTL_SECONDS)
        logger.info("open_meteo_weather_fetched", extra={"lat": lat, "lng": lng, "date": date_str})
        return data

    @staticmethod
    def fetch_global_wind(date_str: str, hour: int) -> dict:
        """Fetch a global 10° wind velocity grid from OpenMeteo.

        Not implemented: returns an empty grid. A real one would query OpenMeteo
        at all 595 grid points (_GLOBAL_LATS × _GLOBAL_LONS), extract U/V at the
        requested hour, reverse row order (la1=80 north-first), and cache with a
        6 h TTL keyed by global_wind:{date}:{hour}.
        """
        return {"source": "global_weather", "grid": []}

    @staticmethod
    def fetch_marine(lat: float, lng: float, date_str: str, force_refresh: bool = False) -> list[dict]:
        cache_key = f"marine:{lat:.1f}:{lng:.1f}:{date_str}"
        if not force_refresh:
            cached = cache.get(cache_key)
            if cached is not None:
                logger.info("open_meteo_cache_hit", extra={"cache_key": cache_key})
                return cached

        client = _make_client()
        responses = client.weather_api(
            _MARINE_URL,
            params=_with_api_key({
                "latitude": lat,
                "longitude": lng,
                "hourly": _MARINE_VARS,
                "start_date": date_str,
                "end_date": date_str,
                "timezone": "UTC",
            }),
        )
        data = _parse_hourly(responses[0], _MARINE_VARS)
        cache.set(cache_key, data, timeout=_FORECAST_CACHE_TTL_SECONDS)
        logger.info("open_meteo_marine_fetched", extra={"lat": lat, "lng": lng, "date": date_str})
        return data
