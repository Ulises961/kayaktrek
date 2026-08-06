"""§8.2 ExpeditionLogService + Celery task tests."""
from datetime import date, datetime, time, timedelta, timezone
from unittest.mock import patch

import pytest

from Api.database import db as _db
from Models.day import Day
from Models.itinerary import Itinerary
from Models.log import Log
from Models.point import Point, PointType
from Models.position_ping import PositionPing
from Models.sea import Sea
from Models.sea_state import SeaState
from Models.trip import Trip, TripStateType
from Models.trip_member import MemberRoleType, TripMember
from Services.expedition_log_service import ExpeditionLogService, _beaufort_from_wave_height
from Services.Utils.geo_utils import haversine_km
from Tasks.expedition_log_task import generate_trip_day_logs, nightly_log_fallback

_DESTINATION = "M8 Expedition Log Test Cove"
_DAY_DATE = date(2026, 6, 10)


def _today_utc() -> date:
    # Fixtures never set trip.timezone_name (no located points), so trip_today()
    # in the beat task falls back to UTC — date.today() (local) would drift a day
    # off it near local midnight in a non-UTC timezone.
    return datetime.now(timezone.utc).date()


def _build_trip_with_itinerary(
    user,
    *,
    points=None,
    state=TripStateType.HAPPENING,
    date_to=None,
    day_date=_DAY_DATE,
):
    itinerary = Itinerary(is_public=False, total_miles=0)
    _db.session.add(itinerary)
    _db.session.flush()

    trip = Trip(
        state=state,
        destination=_DESTINATION,
        date_from=day_date,
        date_to=date_to or day_date,
    )
    _db.session.add(trip)
    _db.session.flush()

    itinerary.trip_id = trip.id
    day = Day(day_number=1, itinerary_id=itinerary.id, date=day_date)
    _db.session.add(day)
    _db.session.flush()

    if points:
        previous = None
        for lat, lon in points:
            point = Point(day_id=day.id, type=PointType.POSITION, latitude=lat, longitude=lon)
            _db.session.add(point)
            _db.session.flush()
            if previous is not None:
                previous.next_id = point.id
            previous = point

    _db.session.add(TripMember(user_id=user.id, trip_id=trip.id, role=MemberRoleType.LEADER))
    _db.session.commit()
    return trip.id, day.id


def _add_ping(trip_id, user_id, lat, lon, recorded_at):
    ping = PositionPing(trip_id=trip_id, user_id=user_id, lat=lat, lon=lon, recorded_at=recorded_at)
    _db.session.add(ping)
    _db.session.commit()
    return ping


@pytest.fixture(autouse=True)
def _cleanup(app):
    yield
    with app.app_context():
        for trip in _db.session.query(Trip).filter_by(destination=_DESTINATION).all():
            _db.session.delete(trip)  # cascades itinerary/days/points/trip_members/pings
        _db.session.commit()


# --- haversine_km ---


def test_haversine_km_known_pair():
    # 1 degree of latitude ~= 111.2 km, along the same meridian.
    assert haversine_km(0.0, 0.0, 1.0, 0.0) == pytest.approx(111.2, abs=0.1)


# --- ExpeditionLogService.generate_day_log ---


def test_uses_ping_track_mileage_for_a_dense_track(user_1):
    trip_id, _day_id = _build_trip_with_itinerary(user_1)
    base = datetime(2026, 6, 10, 8, 0, tzinfo=timezone.utc)
    coords = [(10.0, 20.0), (10.001, 20.001), (10.002, 20.002), (10.003, 20.0035), (10.004, 20.004)]
    for offset, (lat, lon) in enumerate(coords):
        _add_ping(trip_id, user_1.id, lat, lon, base + timedelta(minutes=20 * offset))

    log = ExpeditionLogService.generate_day_log(str(trip_id), str(user_1.id), _DAY_DATE)

    expected_km = sum(haversine_km(*coords[i], *coords[i + 1]) for i in range(len(coords) - 1))
    assert log is not None
    assert log.source == "auto"
    assert float(log.distance) == pytest.approx(expected_km)
    assert float(log.hours) == pytest.approx(80 / 60, abs=0.01)  # 4 * 20 min


def test_sparse_pings_fall_back_to_itinerary_distance(user_1):
    points = [(10.0, 20.0), (10.01, 20.01), (10.02, 20.02)]
    trip_id, _day_id = _build_trip_with_itinerary(user_1, points=points)
    base = datetime(2026, 6, 10, 8, 0, tzinfo=timezone.utc)
    _add_ping(trip_id, user_1.id, 10.0, 20.0, base)
    _add_ping(trip_id, user_1.id, 10.005, 20.005, base + timedelta(minutes=10))

    log = ExpeditionLogService.generate_day_log(str(trip_id), str(user_1.id), _DAY_DATE)

    expected_km = sum(haversine_km(*points[i], *points[i + 1]) for i in range(len(points) - 1))
    assert log is not None
    assert float(log.distance) == pytest.approx(expected_km)
    # hours still reflects the (sparse) ping track — the mileage fallback is independent.
    assert float(log.hours) == pytest.approx(10 / 60, abs=0.01)


def test_gap_over_two_hours_falls_back_to_itinerary_distance(user_1):
    points = [(10.0, 20.0), (10.01, 20.01), (10.02, 20.02)]
    trip_id, _day_id = _build_trip_with_itinerary(user_1, points=points)
    base = datetime(2026, 6, 10, 8, 0, tzinfo=timezone.utc)
    _add_ping(trip_id, user_1.id, 10.0, 20.0, base)
    _add_ping(trip_id, user_1.id, 10.001, 20.001, base + timedelta(minutes=10))
    _add_ping(trip_id, user_1.id, 10.002, 20.002, base + timedelta(hours=3))

    log = ExpeditionLogService.generate_day_log(str(trip_id), str(user_1.id), _DAY_DATE)

    expected_km = sum(haversine_km(*points[i], *points[i + 1]) for i in range(len(points) - 1))
    assert log is not None
    assert float(log.distance) == pytest.approx(expected_km)


def test_stub_log_when_no_pings_and_no_itinerary_data(user_1):
    trip_id, _day_id = _build_trip_with_itinerary(user_1)

    log = ExpeditionLogService.generate_day_log(str(trip_id), str(user_1.id), _DAY_DATE)

    assert log is not None
    assert log.source == "auto"
    assert log.distance is None
    assert log.hours is None
    assert log.route_geojson is None


def test_returns_none_and_writes_nothing_for_a_nonexistent_trip(user_1):
    from uuid import uuid4

    missing_trip_id = str(uuid4())

    log = ExpeditionLogService.generate_day_log(missing_trip_id, str(user_1.id), _DAY_DATE)

    assert log is None
    assert _db.session.query(Log).filter_by(trip_id=missing_trip_id).count() == 0


def test_idempotent_when_log_already_exists(user_1):
    trip_id, _day_id = _build_trip_with_itinerary(user_1)

    first = ExpeditionLogService.generate_day_log(str(trip_id), str(user_1.id), _DAY_DATE)
    second = ExpeditionLogService.generate_day_log(str(trip_id), str(user_1.id), _DAY_DATE)

    assert first is not None
    assert second is None
    count = (
        _db.session.query(Log)
        .filter_by(trip_id=trip_id, user_id=user_1.id, date=_DAY_DATE)
        .count()
    )
    assert count == 1


def test_route_geojson_is_lon_lat_ordered_linestring(user_1):
    trip_id, _day_id = _build_trip_with_itinerary(user_1)
    base = datetime(2026, 6, 10, 8, 0, tzinfo=timezone.utc)
    coords = [(10.0, 20.0), (10.001, 20.001), (10.002, 20.002)]
    for offset, (lat, lon) in enumerate(coords):
        _add_ping(trip_id, user_1.id, lat, lon, base + timedelta(minutes=10 * offset))

    log = ExpeditionLogService.generate_day_log(str(trip_id), str(user_1.id), _DAY_DATE)

    assert log.route_geojson == {
        "type": "LineString",
        "coordinates": [[lon, lat] for lat, lon in coords],
    }


def test_avg_sea_derived_from_day_sea_states(user_1):
    trip_id, day_id = _build_trip_with_itinerary(user_1)
    sea = Sea(day_id=day_id)
    _db.session.add(sea)
    _db.session.flush()
    _db.session.add(SeaState(day_id=day_id, time=time(9, 0), wave_height=1.2))
    _db.session.add(SeaState(day_id=day_id, time=time(15, 0), wave_height=0.8))
    _db.session.commit()

    log = ExpeditionLogService.generate_day_log(str(trip_id), str(user_1.id), _DAY_DATE)

    assert log.avg_sea == _beaufort_from_wave_height((1.2 + 0.8) / 2)


# --- generate_trip_day_logs task ---


def test_generate_trip_day_logs_fans_out_across_members(user_1, user_2):
    trip_id, _day_id = _build_trip_with_itinerary(user_1)
    _db.session.add(TripMember(user_id=user_2.id, trip_id=trip_id, role=MemberRoleType.CREW))
    _db.session.commit()

    generate_trip_day_logs.run(str(trip_id), _DAY_DATE.isoformat())

    count = _db.session.query(Log).filter_by(trip_id=trip_id).count()
    assert count == 2


def test_generate_trip_day_logs_isolates_one_members_failure_from_the_rest(user_1, user_2):
    """A member whose log generation raises (malformed data, DB error, ...) must
    not abort the fan-out for the other crew members — nightly_log_fallback only
    ever dispatches this task for *yesterday*, so a member skipped here because an
    earlier member's exception aborted the loop would never get that day's log."""
    trip_id, _day_id = _build_trip_with_itinerary(user_1)
    _db.session.add(TripMember(user_id=user_2.id, trip_id=trip_id, role=MemberRoleType.CREW))
    _db.session.commit()

    original_generate = ExpeditionLogService.generate_day_log
    failing_user_id = str(user_1.id)

    def _flaky(trip_id_arg, user_id_arg, day_date_arg):
        if user_id_arg == failing_user_id:
            raise RuntimeError("boom")
        return original_generate(trip_id_arg, user_id_arg, day_date_arg)

    with patch(
        "Tasks.expedition_log_task.ExpeditionLogService.generate_day_log", side_effect=_flaky
    ):
        generate_trip_day_logs.run(str(trip_id), _DAY_DATE.isoformat())  # must not raise

    assert _db.session.query(Log).filter_by(trip_id=trip_id, user_id=user_1.id).count() == 0
    assert _db.session.query(Log).filter_by(trip_id=trip_id, user_id=user_2.id).count() == 1

    # session left usable after the rollback — a plain query must not raise.
    assert _db.session.query(Trip).filter_by(id=trip_id).count() == 1


# --- nightly_log_fallback beat task ---


def test_nightly_beat_dispatches_only_trips_with_a_day_yesterday(user_1):
    yesterday = _today_utc() - timedelta(days=1)
    trip_id, _ = _build_trip_with_itinerary(user_1, day_date=yesterday)
    other_trip_id, _ = _build_trip_with_itinerary(user_1, day_date=_today_utc())

    dispatched = []
    with patch("Tasks.expedition_log_task.generate_trip_day_logs") as mock_task:
        mock_task.delay.side_effect = lambda tid, day_iso, **kw: dispatched.append((tid, day_iso))
        nightly_log_fallback.run()

    assert (str(trip_id), yesterday.isoformat()) in dispatched
    assert all(tid != str(other_trip_id) for tid, _ in dispatched)


def test_nightly_beat_retention_sweep_deletes_only_stale_past_trip_pings(user_1):
    stale_date_to = _today_utc() - timedelta(days=40)
    stale_trip_id, _ = _build_trip_with_itinerary(
        user_1, state=TripStateType.PAST, date_to=stale_date_to, day_date=stale_date_to
    )
    _add_ping(stale_trip_id, user_1.id, 10.0, 20.0, datetime.now(timezone.utc) - timedelta(days=45))

    recent_date_to = _today_utc() - timedelta(days=5)
    recent_trip_id, _ = _build_trip_with_itinerary(
        user_1, state=TripStateType.PAST, date_to=recent_date_to, day_date=recent_date_to
    )
    _add_ping(recent_trip_id, user_1.id, 10.0, 20.0, datetime.now(timezone.utc) - timedelta(days=5))

    with patch("Tasks.expedition_log_task.generate_trip_day_logs"):
        nightly_log_fallback.run()

    assert _db.session.query(PositionPing).filter_by(trip_id=stale_trip_id).count() == 0
    assert _db.session.query(PositionPing).filter_by(trip_id=recent_trip_id).count() == 1
