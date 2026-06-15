"""§3 OpenMeteo Celery task + Flask-Caching tests."""
from datetime import date, time, timedelta
from unittest.mock import MagicMock, patch
from uuid import UUID

import numpy as np
import pytest

from Api.cache import cache
from Api.database import db as _db
from Models.day import Day
from Models.itinerary import Itinerary
from Models.point import Point, PointType
from Models.sea import Sea
from Models.sea_state import SeaState
from Models.trip import Trip
from Models.weather import Weather
from Models.weather_state import WeatherState
from Services.open_meteo_service import OpenMeteoService
from Tasks.weather_beat_task import refresh_upcoming_weather
from Tasks.weather_fetch_task import fetch_weather


# ── fake API response data ────────────────────────────────────────────────────

_FAKE_WEATHER = [
    {
        "time": f"{h:02d}:00",
        "temperature_2m": 15.0,
        "precipitation": 0.1,
        "wind_speed_10m": 10.0,
        "wind_direction_10m": 270.0,
        "cloud_cover": 40.0,
    }
    for h in range(24)
]

_FAKE_MARINE = [
    {
        "time": f"{h:02d}:00",
        "wave_height": 1.2,
        "wave_direction": 180.0,
        "wave_period": 8.0,
        "swell_wave_height": 0.8,
        "swell_wave_direction": 175.0,
        "swell_wave_period": 10.0,
        "ocean_current_velocity": 0.5,
        "ocean_current_direction": 90.0,
    }
    for h in range(24)
]


# ── fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def weather_day(app, user_1):
    """
    A day with a date and two route points. Module-scoped so the trip is
    created once and reused across all task tests in this file.
    """
    with app.app_context():
        trip = Trip()
        _db.session.add(trip)
        _db.session.flush()

        itin = Itinerary(trip_id=trip.id, user_id=user_1.id)
        _db.session.add(itin)
        _db.session.flush()

        day = Day(day_number=1, itinerary_id=itin.id, date=date(2026, 8, 10))
        _db.session.add(day)
        _db.session.flush()

        p1 = Point(latitude=50.15, longitude=-5.05, type=PointType.STOP, day_id=day.id)
        p2 = Point(latitude=50.20, longitude=-5.10, type=PointType.STOP, day_id=day.id)
        _db.session.add_all([p1, p2])
        _db.session.commit()

        day_id = str(day.id)
        trip_id = str(trip.id)

    yield day_id

    with app.app_context():
        _cleanup_weather_sea(day_id)
        trip_obj = _db.session.get(Trip, UUID(trip_id))
        if trip_obj:
            _db.session.delete(trip_obj)
            _db.session.commit()


@pytest.fixture(autouse=True)
def cleanup_weather_sea_after(app, weather_day):
    """Delete Weather and Sea rows (and their states) after each test."""
    yield
    with app.app_context():
        _cleanup_weather_sea(weather_day)


def _cleanup_weather_sea(day_id: str) -> None:
    w = _db.session.get(Weather, UUID(day_id))
    if w:
        _db.session.delete(w)
    s = _db.session.get(Sea, UUID(day_id))
    if s:
        _db.session.delete(s)
    _db.session.commit()


# ── task upsert tests ─────────────────────────────────────────────────────────

def test_fetch_weather_creates_weather_and_states(app, weather_day):
    day_id = weather_day
    with patch("Tasks.weather_fetch_task.OpenMeteoService") as mock_svc:
        mock_svc.fetch_weather.return_value = _FAKE_WEATHER
        mock_svc.fetch_marine.return_value = _FAKE_MARINE
        fetch_weather.run(day_id)

    with app.app_context():
        weather = _db.session.get(Weather, UUID(day_id))
        assert weather is not None
        assert weather.model == "open-meteo"
        states = _db.session.query(WeatherState).filter_by(day_id=UUID(day_id)).all()
        assert len(states) == 24
        noon = next(s for s in states if str(s.time) == "12:00:00")
        assert float(noon.temperature) == pytest.approx(15.0)
        assert float(noon.wind_direction) == pytest.approx(270.0)
        assert noon.cloud == "40"


def test_fetch_weather_creates_sea_states(app, weather_day):
    day_id = weather_day
    with patch("Tasks.weather_fetch_task.OpenMeteoService") as mock_svc:
        mock_svc.fetch_weather.return_value = _FAKE_WEATHER
        mock_svc.fetch_marine.return_value = _FAKE_MARINE
        fetch_weather.run(day_id)

    with app.app_context():
        sea = _db.session.get(Sea, UUID(day_id))
        assert sea is not None
        states = _db.session.query(SeaState).filter_by(day_id=UUID(day_id)).all()
        assert len(states) == 24
        noon = next(s for s in states if str(s.time) == "12:00:00")
        assert noon.wave_height == pytest.approx(1.2)
        assert noon.current_speed == pytest.approx(0.5)
        assert noon.swell_direction == pytest.approx(175.0)


def test_fetch_weather_preserves_manual_tidal_fields(app, weather_day):
    day_id = weather_day
    # Pre-create Sea with manually entered tidal data
    with app.app_context():
        sea = Sea(
            day_id=UUID(day_id),
            high_tide=time(12, 0),
            low_tide=time(6, 0),
            tidal_range_m=4.5,
            moon_phase="full",
        )
        _db.session.add(sea)
        _db.session.commit()

    with patch("Tasks.weather_fetch_task.OpenMeteoService") as mock_svc:
        mock_svc.fetch_weather.return_value = _FAKE_WEATHER
        mock_svc.fetch_marine.return_value = _FAKE_MARINE
        fetch_weather.run(day_id)

    with app.app_context():
        sea = _db.session.get(Sea, UUID(day_id))
        assert sea.high_tide is not None
        assert str(sea.high_tide) == "12:00:00"
        assert str(sea.low_tide) == "06:00:00"
        assert sea.tidal_range_m == pytest.approx(4.5)
        assert sea.moon_phase == "full"
        assert len(sea.sea_states) == 24


def test_fetch_weather_replaces_existing_states(app, weather_day):
    day_id = weather_day
    with patch("Tasks.weather_fetch_task.OpenMeteoService") as mock_svc:
        mock_svc.fetch_weather.return_value = _FAKE_WEATHER
        mock_svc.fetch_marine.return_value = _FAKE_MARINE
        fetch_weather.run(day_id)

    with app.app_context():
        assert _db.session.query(WeatherState).filter_by(day_id=UUID(day_id)).count() == 24

    with patch("Tasks.weather_fetch_task.OpenMeteoService") as mock_svc:
        mock_svc.fetch_weather.return_value = _FAKE_WEATHER[:12]
        mock_svc.fetch_marine.return_value = _FAKE_MARINE[:12]
        fetch_weather.run(day_id)

    with app.app_context():
        assert _db.session.query(WeatherState).filter_by(day_id=UUID(day_id)).count() == 12
        assert _db.session.query(SeaState).filter_by(day_id=UUID(day_id)).count() == 12


def test_fetch_weather_skips_when_no_route_points(app, user_1):
    """Day with only INTEREST points (or no points) produces no Weather/Sea rows."""
    with app.app_context():
        trip = Trip()
        _db.session.add(trip)
        _db.session.flush()
        itin = Itinerary(trip_id=trip.id, user_id=user_1.id)
        _db.session.add(itin)
        _db.session.flush()
        day = Day(day_number=1, itinerary_id=itin.id, date=date(2026, 8, 11))
        _db.session.add(day)
        poi = Point(latitude=50.15, longitude=-5.05, type=PointType.INTEREST, day_id=day.id)
        _db.session.add(poi)
        _db.session.commit()
        day_id = str(day.id)
        trip_id = str(trip.id)

    fetch_weather.run(day_id)

    with app.app_context():
        assert _db.session.get(Weather, UUID(day_id)) is None
        assert _db.session.get(Sea, UUID(day_id)) is None
        trip_obj = _db.session.get(Trip, UUID(trip_id))
        if trip_obj:
            _db.session.delete(trip_obj)
            _db.session.commit()


# ── cache tests ───────────────────────────────────────────────────────────────

def test_cache_hit_skips_api_call(app):
    lat, lng, date_str = 50.15, -5.05, "2026-08-10"
    cache_key = f"weather:{lat:.1f}:{lng:.1f}:{date_str}"
    with app.app_context():
        cache.set(cache_key, _FAKE_WEATHER)
        try:
            with patch("Services.open_meteo_service._make_client") as mock_make:
                result = OpenMeteoService.fetch_weather(lat, lng, date_str)
            mock_make.assert_not_called()
            assert result == _FAKE_WEATHER
        finally:
            cache.delete(cache_key)


def test_cache_miss_calls_api(app):
    mock_hourly = MagicMock()
    mock_hourly.Time.return_value = 1755216000  # 2026-08-15 00:00 UTC
    mock_hourly.Interval.return_value = 3600
    mock_var = MagicMock()
    mock_var.ValuesAsNumpy.return_value = np.array([15.0] * 24)
    mock_hourly.Variables.return_value = mock_var

    mock_response = MagicMock()
    mock_response.Hourly.return_value = mock_hourly

    mock_client = MagicMock()
    mock_client.weather_api.return_value = [mock_response]

    with app.app_context():
        cache.delete("weather:50.2:-5.1:2026-08-15")
        try:
            with patch("Services.open_meteo_service._make_client", return_value=mock_client):
                result = OpenMeteoService.fetch_weather(50.15, -5.05, "2026-08-15")
            mock_client.weather_api.assert_called_once()
            assert len(result) == 24
            assert result[0]["time"] == "00:00"
        finally:
            cache.delete("weather:50.2:-5.1:2026-08-15")


# ── beat task tests ───────────────────────────────────────────────────────────

def test_beat_task_dispatches_only_future_days(app, user_1):
    today = date.today()

    with app.app_context():
        trip = Trip()
        _db.session.add(trip)
        _db.session.flush()
        itin = Itinerary(trip_id=trip.id, user_id=user_1.id)
        _db.session.add(itin)
        _db.session.flush()

        day_future = Day(day_number=1, itinerary_id=itin.id, date=today + timedelta(days=5))
        day_edge = Day(day_number=2, itinerary_id=itin.id, date=today + timedelta(days=10))
        day_past = Day(day_number=3, itinerary_id=itin.id, date=today - timedelta(days=1))
        day_out = Day(day_number=4, itinerary_id=itin.id, date=today + timedelta(days=11))
        day_no_date = Day(day_number=5, itinerary_id=itin.id, date=None)
        _db.session.add_all([day_future, day_edge, day_past, day_out, day_no_date])
        _db.session.commit()

        future_id = str(day_future.id)
        edge_id = str(day_edge.id)
        past_id = str(day_past.id)
        trip_id = str(trip.id)

    dispatched = []
    with patch("Tasks.weather_beat_task.fetch_weather") as mock_task:
        mock_task.delay.side_effect = lambda day_id, **kw: dispatched.append(day_id)
        refresh_upcoming_weather.run()

    assert future_id in dispatched
    assert edge_id in dispatched
    assert past_id not in dispatched

    with app.app_context():
        trip_obj = _db.session.get(Trip, UUID(trip_id))
        if trip_obj:
            _db.session.delete(trip_obj)
            _db.session.commit()
