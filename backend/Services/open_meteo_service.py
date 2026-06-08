import logging
from datetime import datetime, timezone

import numpy as np
import openmeteo_requests
import requests
from retry_requests import retry

from Api.cache import cache

logger = logging.getLogger(__name__)

_WEATHER_URL = "https://api.open-meteo.com/v1/forecast"
_MARINE_URL = "https://marine-api.open-meteo.com/v1/marine"

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


def _make_client() -> openmeteo_requests.Client:
    session = retry(requests.Session(), retries=3, backoff_factor=0.5)
    return openmeteo_requests.Client(session=session)


def _float_or_none(val: float) -> float | None:
    return None if np.isnan(val) else float(val)


def _parse_hourly(response, var_names: list[str]) -> list[dict]:
    hourly = response.Hourly()
    start_ts = hourly.Time()
    interval = hourly.Interval()
    arrays = [hourly.Variables(i).ValuesAsNumpy() for i in range(len(var_names))]
    n = len(arrays[0]) if arrays else 0

    records = []
    for i in range(n):
        t = datetime.fromtimestamp(start_ts + i * interval, tz=timezone.utc)
        record = {"time": t.strftime("%H:%M")}
        for j, name in enumerate(var_names):
            record[name] = _float_or_none(arrays[j][i])
        records.append(record)
    return records


class OpenMeteoService:
    @staticmethod
    def fetch_weather(lat: float, lng: float, date_str: str) -> list[dict]:
        cache_key = f"weather:{lat:.1f}:{lng:.1f}:{date_str}"
        cached = cache.get(cache_key)
        if cached is not None:
            logger.info("open_meteo_cache_hit", extra={"cache_key": cache_key})
            return cached

        client = _make_client()
        responses = client.weather_api(
            _WEATHER_URL,
            params={
                "latitude": lat,
                "longitude": lng,
                "hourly": _WEATHER_VARS,
                "start_date": date_str,
                "end_date": date_str,
                "timezone": "UTC",
            },
        )
        data = _parse_hourly(responses[0], _WEATHER_VARS)
        cache.set(cache_key, data)
        logger.info("open_meteo_weather_fetched", extra={"lat": lat, "lng": lng, "date": date_str})
        return data

    @staticmethod
    def fetch_marine(lat: float, lng: float, date_str: str) -> list[dict]:
        cache_key = f"marine:{lat:.1f}:{lng:.1f}:{date_str}"
        cached = cache.get(cache_key)
        if cached is not None:
            logger.info("open_meteo_cache_hit", extra={"cache_key": cache_key})
            return cached

        client = _make_client()
        responses = client.weather_api(
            _MARINE_URL,
            params={
                "latitude": lat,
                "longitude": lng,
                "hourly": _MARINE_VARS,
                "start_date": date_str,
                "end_date": date_str,
                "timezone": "UTC",
            },
        )
        data = _parse_hourly(responses[0], _MARINE_VARS)
        cache.set(cache_key, data)
        logger.info("open_meteo_marine_fetched", extra={"lat": lat, "lng": lng, "date": date_str})
        return data
