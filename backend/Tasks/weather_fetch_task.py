import logging
from datetime import datetime
from typing import Optional
from uuid import UUID

from Api.celery_app import celery_app
from Api.database import db
from Models.day import Day
from Models.sea import Sea
from Models.sea_state import SeaState
from Models.weather import Weather
from Models.weather_state import WeatherState
from Services.open_meteo_service import OpenMeteoService

logger = logging.getLogger(__name__)


@celery_app.task(name="Tasks.weather_fetch_task.fetch_weather", bind=True)
def fetch_weather(self, day_id: str, request_id: Optional[str] = None) -> None:
    logger.info(
        "weather_fetch_started",
        extra={"day_id": day_id, "request_id": request_id, "task_id": self.request.id},
    )

    day = db.session.get(Day, UUID(day_id))
    if day is None:
        logger.warning("weather_fetch_day_not_found", extra={"day_id": day_id})
        return

    if not day.date:
        logger.warning("weather_fetch_no_date", extra={"day_id": day_id})
        return

    ref = _midpoint_of_route(day)
    if ref is None:
        logger.warning("weather_fetch_no_coordinates", extra={"day_id": day_id})
        return

    lat, lng = ref
    date_str = day.date.isoformat()

    weather_records = OpenMeteoService.fetch_weather(lat, lng, date_str)
    marine_records = OpenMeteoService.fetch_marine(lat, lng, date_str)

    _upsert_weather(UUID(day_id), weather_records)
    _upsert_sea(UUID(day_id), marine_records)

    db.session.commit()
    logger.info(
        "weather_fetch_completed",
        extra={
            "day_id": day_id,
            "weather_states": len(weather_records),
            "sea_states": len(marine_records),
        },
    )


def _midpoint_of_route(day) -> tuple[float, float] | None:
    """Return (lat, lng) of the midpoint of the day's ordered route.

    Walking the linked list guarantees we use an actual on-water coordinate
    rather than an arithmetic mean that could fall on land.
    """
    candidates = {
        p.id: p for p in (day.points or [])
        if p.latitude is not None
        and p.longitude is not None
    }
    if not candidates:
        return None

    next_ids = {p.next_id for p in candidates.values() if p.next_id is not None}
    heads = [p for p in candidates.values() if p.id not in next_ids]
    head = heads[0] if heads else next(iter(candidates.values()))

    ordered: list = []
    current = head
    seen: set = set()
    while current is not None and current.id not in seen:
        ordered.append(current)
        seen.add(current.id)
        current = candidates.get(current.next_id)

    mid = ordered[len(ordered) // 2]
    return float(mid.latitude), float(mid.longitude)


def _upsert_weather(day_uuid: UUID, records: list[dict]) -> None:
    weather = db.session.get(Weather, day_uuid)
    if weather is None:
        weather = Weather(day_id=day_uuid, model="open-meteo")
        db.session.add(weather)
        db.session.flush()
    else:
        weather.model = "open-meteo"
        for ws in list(weather.weather_states):
            db.session.delete(ws)
        db.session.flush()

    for rec in records:
        t = datetime.strptime(rec["time"], "%H:%M").time()
        cloud = rec.get("cloud_cover")
        db.session.add(WeatherState(
            day_id=day_uuid,
            time=t,
            temperature=rec.get("temperature_2m"),
            precipitation=rec.get("precipitation"),
            wind_direction=rec.get("wind_direction_10m"),
            wind_force=rec.get("wind_speed_10m"),
            cloud=str(int(cloud)) if cloud is not None else None,
        ))


def _upsert_sea(day_uuid: UUID, records: list[dict]) -> None:
    sea = db.session.get(Sea, day_uuid)
    if sea is None:
        sea = Sea(day_id=day_uuid)
        db.session.add(sea)
        db.session.flush()
    else:
        for ss in list(sea.sea_states):
            db.session.delete(ss)
        db.session.flush()

    for rec in records:
        t = datetime.strptime(rec["time"], "%H:%M").time()
        db.session.add(SeaState(
            day_id=day_uuid,
            time=t,
            wave_height=rec.get("wave_height"),
            wave_direction=rec.get("wave_direction"),
            swell_wave_height=rec.get("swell_wave_height"),
            swell_direction=rec.get("swell_wave_direction"),
            swell_period=rec.get("swell_wave_period"),
            current_speed=rec.get("ocean_current_velocity"),
            current_direction=rec.get("ocean_current_direction"),
        ))
