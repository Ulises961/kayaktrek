"""§3 OpenMeteo Celery task + Flask-Caching tests."""
from datetime import date, datetime, time, timedelta, timezone
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
from Models.trip import Trip, TripStateType
from Models.weather import Weather
from Models.weather_state import WeatherState
from Services.open_meteo_service import OpenMeteoService
from Tasks.weather_beat_task import (
    ATTENTION_TIMEOUT_DAYS,
    FORECAST_HORIZON_DAYS,
    refresh_upcoming_weather,
    refresh_urgent_weather,
)
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


def test_fetch_weather_bumps_fetched_at_and_recorded_at(app, weather_day):
    day_id = weather_day
    with patch("Tasks.weather_fetch_task.OpenMeteoService") as mock_svc:
        mock_svc.fetch_weather.return_value = _FAKE_WEATHER
        mock_svc.fetch_marine.return_value = _FAKE_MARINE
        fetch_weather.run(day_id)

    with app.app_context():
        first_fetched_at = _db.session.get(Weather, UUID(day_id)).fetched_at
        first_recorded_at = _db.session.get(Sea, UUID(day_id)).recorded_at
        assert first_fetched_at is not None
        assert first_recorded_at is not None

    with patch("Tasks.weather_fetch_task.OpenMeteoService") as mock_svc:
        mock_svc.fetch_weather.return_value = _FAKE_WEATHER
        mock_svc.fetch_marine.return_value = _FAKE_MARINE
        fetch_weather.run(day_id)

    with app.app_context():
        second_fetched_at = _db.session.get(Weather, UUID(day_id)).fetched_at
        second_recorded_at = _db.session.get(Sea, UUID(day_id)).recorded_at
        assert second_fetched_at >= first_fetched_at
        assert second_recorded_at >= first_recorded_at


def test_fetch_weather_force_refresh_passed_to_open_meteo(app, weather_day):
    day_id = weather_day
    with patch("Tasks.weather_fetch_task.OpenMeteoService") as mock_svc:
        mock_svc.fetch_weather.return_value = _FAKE_WEATHER
        mock_svc.fetch_marine.return_value = _FAKE_MARINE
        fetch_weather.run(day_id, force_refresh=True)

    mock_svc.fetch_weather.assert_called_once()
    mock_svc.fetch_marine.assert_called_once()
    assert mock_svc.fetch_weather.call_args.kwargs["force_refresh"] is True
    assert mock_svc.fetch_marine.call_args.kwargs["force_refresh"] is True


def test_fetch_weather_skips_when_no_route_points(app, user_1):
    """A day with no coordinate-bearing points produces no Weather/Sea rows."""
    with app.app_context():
        trip = Trip()
        _db.session.add(trip)
        _db.session.flush()
        itin = Itinerary(trip_id=trip.id, user_id=user_1.id)
        _db.session.add(itin)
        _db.session.flush()
        day = Day(day_number=1, itinerary_id=itin.id, date=date(2026, 8, 11))
        _db.session.add(day)
        coordless = Point(latitude=None, longitude=None, type=PointType.STOP, day_id=day.id)
        _db.session.add(coordless)
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


# ── task failure path (§5 of the rubric — beat tasks run unattended) ──────────
#
# fetch_weather has no try/except of its own: a failure propagates straight out
# of the Celery task. In production that is safe — Api/celery_app.py's
# ContextTask wraps every real invocation in its own `with app.app_context()`,
# and Flask-SQLAlchemy's teardown discards (rolls back) whatever the failed
# attempt left pending the moment that context exits, before the next task's
# context is opened. These tests exercise that same contract directly (`.run()`
# bypasses ContextTask, so the explicit `rollback()` stands in for the teardown
# a production worker performs automatically) — proving that a failure doesn't
# leave debris a later call could see, not just that it doesn't crash.


def test_fetch_weather_propagates_api_connection_error(app, weather_day):
    """An OpenMeteo outage must not be swallowed — Celery needs the real
    exception to mark the task failed rather than silently 'succeeding'."""
    day_id = weather_day
    with patch("Tasks.weather_fetch_task.OpenMeteoService") as mock_svc:
        mock_svc.fetch_weather.side_effect = ConnectionError("open-meteo unreachable")
        with pytest.raises(ConnectionError):
            fetch_weather.run(day_id)

    with app.app_context():
        # nothing was ever fetched for marine data, and nothing upserted at all
        assert _db.session.get(Weather, UUID(day_id)) is None
        assert _db.session.get(Sea, UUID(day_id)) is None
        # session left usable — a plain query after the failure must not raise.
        assert _db.session.get(Day, UUID(day_id)) is not None


def test_fetch_weather_malformed_record_raises_and_rolls_back_cleanly(app, weather_day):
    """A record missing the 'time' key (a malformed/changed upstream schema)
    raises while building WeatherState rows, after the Weather parent row has
    already been flushed (not committed). Without an explicit rollback that
    partial insert would be invisible to a later commit only by accident of
    test ordering — asserting it here pins the actual contract."""
    day_id = weather_day
    malformed = [{"temperature_2m": 15.0}]  # no "time"
    with patch("Tasks.weather_fetch_task.OpenMeteoService") as mock_svc:
        mock_svc.fetch_weather.return_value = malformed
        mock_svc.fetch_marine.return_value = _FAKE_MARINE
        with pytest.raises(KeyError):
            fetch_weather.run(day_id)

    with app.app_context():
        # mirrors the rollback Flask-SQLAlchemy's teardown performs in production
        _db.session.rollback()
        assert _db.session.get(Weather, UUID(day_id)) is None
        assert _db.session.query(WeatherState).filter_by(day_id=UUID(day_id)).count() == 0

    # session recovered — a subsequent successful run still works normally.
    with patch("Tasks.weather_fetch_task.OpenMeteoService") as mock_svc:
        mock_svc.fetch_weather.return_value = _FAKE_WEATHER
        mock_svc.fetch_marine.return_value = _FAKE_MARINE
        fetch_weather.run(day_id)

    with app.app_context():
        assert _db.session.get(Weather, UUID(day_id)) is not None
        assert _db.session.query(WeatherState).filter_by(day_id=UUID(day_id)).count() == 24


def test_beat_task_dispatch_failure_is_not_swallowed(app, user_1):
    """If dispatching to the broker itself fails (e.g. RabbitMQ unreachable), the
    beat task must not report success — Celery beat's own failure visibility is
    the only signal an operator gets, since nobody watches an hourly beat tick
    fire in real time."""
    with app.app_context():
        trip = Trip()
        _db.session.add(trip)
        _db.session.flush()
        itin = Itinerary(trip_id=trip.id, user_id=user_1.id)
        _db.session.add(itin)
        _db.session.flush()
        day = Day(day_number=1, itinerary_id=itin.id, date=date.today() + timedelta(days=3))
        _db.session.add(day)
        _db.session.commit()
        trip_id = str(trip.id)

    try:
        with patch("Tasks.weather_beat_task.fetch_weather") as mock_task:
            mock_task.delay.side_effect = ConnectionError("broker unreachable")
            with pytest.raises(ConnectionError):
                refresh_upcoming_weather.run()
    finally:
        with app.app_context():
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


def test_force_refresh_bypasses_cache_hit(app):
    lat, lng, date_str = 50.16, -5.06, "2026-08-11"
    cache_key = f"weather:{lat:.1f}:{lng:.1f}:{date_str}"
    with app.app_context():
        cache.set(cache_key, _FAKE_WEATHER)
        try:
            with patch("Services.open_meteo_service._make_client") as mock_make:
                mock_make.return_value.weather_api.side_effect = RuntimeError("should not be reached in this stub")
                with pytest.raises(RuntimeError):
                    OpenMeteoService.fetch_weather(lat, lng, date_str, force_refresh=True)
            mock_make.assert_called_once()
        finally:
            cache.delete(cache_key)


def test_fetch_weather_reindexes_a_partial_response_onto_the_full_24_hour_grid(app):
    """OpenMeteo can return fewer than 24 hourly records (forecast-horizon
    edge cases, a degraded upstream response). _upsert_weather deletes and
    recreates the WHOLE state set on every refresh keyed by the derived id
    f"{day_id}:{time}" (docs/mobile/sync-protocol-spec.md §6.2) — if the set
    of times ever shrinks between refreshes, the mobile sync channel has no
    way to tell a device those hours were removed (Services/mobile_sync_service.py
    writes no per-state tombstone, relying on "the parent covers them").
    OpenMeteoService must therefore always return a full, fixed 24-hour grid
    (00:00..23:00) — missing hours as null-valued rows, not absent ones — so
    the id set is stable by construction rather than by upstream luck."""
    mock_hourly = MagicMock()
    mock_hourly.Time.return_value = 1755216000  # 2026-08-15 00:00 UTC
    mock_hourly.Interval.return_value = 3600
    mock_var = MagicMock()
    mock_var.ValuesAsNumpy.return_value = np.array([15.0] * 18)  # only 18 of 24 hours
    mock_hourly.Variables.return_value = mock_var

    mock_response = MagicMock()
    mock_response.Hourly.return_value = mock_hourly

    mock_client = MagicMock()
    mock_client.weather_api.return_value = [mock_response]

    with app.app_context():
        # Distinct coordinates from test_cache_miss_calls_api, on purpose —
        # both tests run in this file's single worker in order (backend/CLAUDE.md),
        # and sharing a cache key lets one test's leftover entry silently
        # short-circuit the other's "calls the API" assertion.
        cache.delete("weather:51.2:-6.2:2026-08-16")
        try:
            with patch("Services.open_meteo_service._make_client", return_value=mock_client):
                result = OpenMeteoService.fetch_weather(51.25, -6.15, "2026-08-16")
            assert len(result) == 24
            assert [record["time"] for record in result] == [f"{h:02d}:00" for h in range(24)]
            assert result[17]["temperature_2m"] == 15.0
            assert result[18]["temperature_2m"] is None
            assert result[23]["temperature_2m"] is None
        finally:
            cache.delete("weather:51.2:-6.2:2026-08-16")


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


# ── M32: trip-state, horizon rolling-window, and attention gating ────────────

def _make_trip_with_day(app, user_1, *, state, day_date, last_accessed_at=None):
    """last_accessed_at defaults to "just viewed"."""
    if last_accessed_at is None:
        last_accessed_at = datetime.now(timezone.utc).replace(tzinfo=None)
    with app.app_context():
        trip = Trip(state=state, last_accessed_at=last_accessed_at)
        _db.session.add(trip)
        _db.session.flush()
        itin = Itinerary(trip_id=trip.id, user_id=user_1.id)
        _db.session.add(itin)
        _db.session.flush()
        day = Day(day_number=1, itinerary_id=itin.id, date=day_date)
        _db.session.add(day)
        _db.session.commit()
        return str(trip.id), str(day.id)


def _delete_trip(app, trip_id):
    with app.app_context():
        trip_obj = _db.session.get(Trip, UUID(trip_id))
        if trip_obj:
            _db.session.delete(trip_obj)
            _db.session.commit()


def test_beat_task_excludes_past_and_archived_trips(app, user_1):
    """A past/archived trip's days must never be dispatched, even inside the
    forecast horizon — the beat task had no Trip.state filter at all before
    this (docs/adr/features.md §1a)."""
    today = date.today()
    trip_ids = []
    try:
        past_id, past_day_id = _make_trip_with_day(
            app, user_1, state=TripStateType.PAST, day_date=today + timedelta(days=2)
        )
        trip_ids.append(past_id)
        archived_id, archived_day_id = _make_trip_with_day(
            app, user_1, state=TripStateType.ARCHIVED, day_date=today + timedelta(days=2)
        )
        trip_ids.append(archived_id)
        building_id, building_day_id = _make_trip_with_day(
            app, user_1, state=TripStateType.BUILDING, day_date=today + timedelta(days=2)
        )
        trip_ids.append(building_id)

        dispatched = []
        with patch("Tasks.weather_beat_task.fetch_weather") as mock_task:
            mock_task.delay.side_effect = lambda day_id, **kw: dispatched.append(day_id)
            refresh_upcoming_weather.run()

        assert past_day_id not in dispatched
        assert archived_day_id not in dispatched
        assert building_day_id in dispatched
    finally:
        for trip_id in trip_ids:
            _delete_trip(app, trip_id)


def test_beat_task_rolling_window_never_needs_a_wider_horizon(app, user_1):
    """A trip longer than FORECAST_HORIZON_DAYS: a day just beyond the horizon
    is excluded today, exactly like a day just inside it is included — the
    same query, re-evaluated against today, is what makes that day fetchable
    on its own once 'today' advances, with no horizon change required."""
    today = date.today()
    trip_ids = []
    try:
        trip_id, inside_day_id = _make_trip_with_day(
            app, user_1, state=TripStateType.BUILDING, day_date=today + timedelta(days=FORECAST_HORIZON_DAYS)
        )
        trip_ids.append(trip_id)
        outside_trip_id, outside_day_id = _make_trip_with_day(
            app, user_1, state=TripStateType.BUILDING, day_date=today + timedelta(days=FORECAST_HORIZON_DAYS + 1)
        )
        trip_ids.append(outside_trip_id)

        dispatched = []
        with patch("Tasks.weather_beat_task.fetch_weather") as mock_task:
            mock_task.delay.side_effect = lambda day_id, **kw: dispatched.append(day_id)
            refresh_upcoming_weather.run()

        assert inside_day_id in dispatched
        assert outside_day_id not in dispatched
    finally:
        for trip_id in trip_ids:
            _delete_trip(app, trip_id)


def test_beat_task_skips_a_dormant_trip_and_resumes_on_next_view(app, user_1):
    """A trip untouched for longer than ATTENTION_TIMEOUT_DAYS is skipped by
    the daily sweep; bumping last_accessed_at (simulating a view) makes the
    very next tick treat it as due again."""
    today = date.today()
    stale_at = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=ATTENTION_TIMEOUT_DAYS + 1)
    trip_id, day_id = _make_trip_with_day(
        app, user_1, state=TripStateType.BUILDING, day_date=today + timedelta(days=2), last_accessed_at=stale_at
    )
    try:
        dispatched = []
        with patch("Tasks.weather_beat_task.fetch_weather") as mock_task:
            mock_task.delay.side_effect = lambda d, **kw: dispatched.append(d)
            refresh_upcoming_weather.run()
        assert day_id not in dispatched

        with app.app_context():
            trip_obj = _db.session.get(Trip, UUID(trip_id))
            trip_obj.last_accessed_at = datetime.now(timezone.utc).replace(tzinfo=None)
            _db.session.commit()

        dispatched = []
        with patch("Tasks.weather_beat_task.fetch_weather") as mock_task:
            mock_task.delay.side_effect = lambda d, **kw: dispatched.append(d)
            refresh_upcoming_weather.run()
        assert day_id in dispatched
    finally:
        _delete_trip(app, trip_id)


def _dispatched_by(task) -> list[str]:
    dispatched: list[str] = []
    with patch("Tasks.weather_beat_task.fetch_weather") as mock_task:
        mock_task.delay.side_effect = lambda day_id, **kw: dispatched.append(day_id)
        task.run()
    return dispatched


def test_new_trip_counts_as_viewed_from_creation(app, user_1):
    """A trip created without an explicit last_accessed_at gets one on insert,
    so it is fetched from day one and ages out 7 days later like any other."""
    today = date.today()
    with app.app_context():
        trip = Trip(state=TripStateType.BUILDING)
        _db.session.add(trip)
        _db.session.flush()
        itinerary = Itinerary(trip_id=trip.id, user_id=user_1.id)
        _db.session.add(itinerary)
        _db.session.flush()
        day = Day(day_number=1, itinerary_id=itinerary.id, date=today + timedelta(days=2))
        _db.session.add(day)
        _db.session.commit()
        trip_id, day_id = str(trip.id), str(day.id)
        assert trip.last_accessed_at is not None
    try:
        assert day_id in _dispatched_by(refresh_upcoming_weather)
    finally:
        _delete_trip(app, trip_id)


def test_trip_with_no_recorded_view_is_skipped_by_both_sweeps(app, user_1):
    """A NULL last_accessed_at has no view to measure dormancy from. Treating it
    as active meant every trip untouched since the M32 migration was fetched
    forever, which is exactly the trip attention-gating exists to skip."""
    today = date.today()
    trip_id, day_id = _make_trip_with_day(app, user_1, state=TripStateType.HAPPENING, day_date=today)
    try:
        # Not via the constructor: the column's insert default fills a None in,
        # so an aged row from before that default has to be nulled after the fact.
        with app.app_context():
            _db.session.query(Trip).filter(Trip.id == UUID(trip_id)).update(
                {Trip.last_accessed_at: None}
            )
            _db.session.commit()

        assert day_id not in _dispatched_by(refresh_upcoming_weather)
        assert day_id not in _dispatched_by(refresh_urgent_weather)
    finally:
        _delete_trip(app, trip_id)


def test_urgent_beat_respects_the_forecast_horizon_for_a_happening_trip(app, user_1):
    """A long happening expedition is refreshed every 6h only inside the 10-day
    confidence horizon; later days roll in as today advances, never earlier."""
    today = date.today()
    trip_ids = []
    try:
        inside_trip_id, inside_day_id = _make_trip_with_day(
            app, user_1, state=TripStateType.HAPPENING, day_date=today + timedelta(days=FORECAST_HORIZON_DAYS)
        )
        trip_ids.append(inside_trip_id)
        beyond_trip_id, beyond_day_id = _make_trip_with_day(
            app, user_1, state=TripStateType.HAPPENING, day_date=today + timedelta(days=FORECAST_HORIZON_DAYS + 5)
        )
        trip_ids.append(beyond_trip_id)

        dispatched = _dispatched_by(refresh_urgent_weather)

        assert inside_day_id in dispatched
        assert beyond_day_id not in dispatched
    finally:
        for trip_id in trip_ids:
            _delete_trip(app, trip_id)


def test_each_day_belongs_to_exactly_one_sweep(app, user_1):
    """Happening trips and imminent days are the 6h sweep's; everything else in
    the horizon is the daily sweep's. A day in both would be fetched twice
    whenever the two run close together."""
    today = date.today()
    trip_ids = []
    try:
        cases = {
            "happening_later": (TripStateType.HAPPENING, today + timedelta(days=5)),
            "building_today": (TripStateType.BUILDING, today),
            "building_tomorrow": (TripStateType.BUILDING, today + timedelta(days=1)),
            "building_later": (TripStateType.BUILDING, today + timedelta(days=5)),
        }
        day_ids = {}
        for name, (state, day_date) in cases.items():
            trip_id, day_id = _make_trip_with_day(app, user_1, state=state, day_date=day_date)
            trip_ids.append(trip_id)
            day_ids[name] = day_id

        daily = set(_dispatched_by(refresh_upcoming_weather))
        urgent = set(_dispatched_by(refresh_urgent_weather))

        assert daily.isdisjoint(urgent)
        assert day_ids["happening_later"] in urgent
        assert day_ids["building_today"] in urgent
        assert day_ids["building_tomorrow"] in urgent
        assert day_ids["building_later"] in daily
    finally:
        for trip_id in trip_ids:
            _delete_trip(app, trip_id)


def test_urgent_beat_dispatches_imminent_day_for_a_building_trip(app, user_1):
    """A building trip's day within the imminent window also qualifies for the
    urgent sweep, not just a happening trip's."""
    today = date.today()
    trip_id, day_id = _make_trip_with_day(app, user_1, state=TripStateType.BUILDING, day_date=today)
    try:
        dispatched = []
        with patch("Tasks.weather_beat_task.fetch_weather") as mock_task:
            mock_task.delay.side_effect = lambda d, **kw: dispatched.append(d)
            refresh_urgent_weather.run()
        assert day_id in dispatched
    finally:
        _delete_trip(app, trip_id)


def test_urgent_beat_excludes_a_building_trip_day_beyond_the_imminent_window(app, user_1):
    today = date.today()
    trip_id, day_id = _make_trip_with_day(
        app, user_1, state=TripStateType.BUILDING, day_date=today + timedelta(days=5)
    )
    try:
        dispatched = []
        with patch("Tasks.weather_beat_task.fetch_weather") as mock_task:
            mock_task.delay.side_effect = lambda d, **kw: dispatched.append(d)
            refresh_urgent_weather.run()
        assert day_id not in dispatched
    finally:
        _delete_trip(app, trip_id)


def test_urgent_beat_excludes_past_trip_even_with_an_imminent_day(app, user_1):
    """The state gate applies to the urgent sweep too — a past/archived trip
    must never be admitted through the 'imminent day' OR-arm."""
    today = date.today()
    trip_id, day_id = _make_trip_with_day(app, user_1, state=TripStateType.PAST, day_date=today)
    try:
        dispatched = []
        with patch("Tasks.weather_beat_task.fetch_weather") as mock_task:
            mock_task.delay.side_effect = lambda d, **kw: dispatched.append(d)
            refresh_urgent_weather.run()
        assert day_id not in dispatched
    finally:
        _delete_trip(app, trip_id)
