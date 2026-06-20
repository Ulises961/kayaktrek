"""§1 TidalService tests — rule of 12s, height_at, interpolate_stream_rate, tidal gates."""
import types
from datetime import time
from decimal import Decimal

import pytest
from geoalchemy2.shape import from_shape
from shapely.geometry import Point as ShapelyPoint

from Api.database import db as _db
from Models.day import Day
from Models.point import Point, PointType
from Models.sea import Sea
from Models.tidal_station import TidalStation
from Models.tidal_stream_entry import TidalStreamEntry
from Services.tidal_service import TidalService
from uuid import UUID


# ── helpers ──────────────────────────────────────────────────────────────────

def _sea(high_tide, low_tide, tidal_range_m):
    return types.SimpleNamespace(
        high_tide=high_tide,
        low_tide=low_tide,
        tidal_range_m=tidal_range_m,
    )


def _entry(spring_rate, neap_rate, station):
    return types.SimpleNamespace(
        spring_rate_knots=float(spring_rate) if spring_rate is not None else None,
        neap_rate_knots=float(neap_rate) if neap_rate is not None else None,
        station=station,
    )


def _station(mean_spring_range_m):
    return types.SimpleNamespace(
        mean_spring_range_m=float(mean_spring_range_m) if mean_spring_range_m is not None else None,
    )


# ── rule_of_twelfths ─────────────────────────────────────────────────────────

def test_rule_of_twelfths_returns_7_entries():
    # 6-hour flood (LW=06:00, HW=12:00): step_h=1.0, so hour_from_lw is 0..6 exactly
    sea = _sea(time(12, 0), time(6, 0), 4.0)
    result = TidalService.rule_of_twelfths(sea)
    assert result is not None
    assert len(result) == 7
    assert result[0]["hour_from_lw"] == pytest.approx(0.0)
    assert result[6]["hour_from_lw"] == pytest.approx(6.0)
    assert result[0]["cumulative_fraction"] == 0.0
    assert result[6]["cumulative_fraction"] == 1.0
    assert result[6]["estimated_height_m"] == pytest.approx(4.0)


def test_rule_of_twelfths_scales_to_actual_flood_duration():
    # 4-hour flood (LW=08:00, HW=12:00): step_h=4/6≈0.667 h
    sea = _sea(time(12, 0), time(8, 0), 4.0)
    result = TidalService.rule_of_twelfths(sea)
    assert result is not None
    # Last entry should be at 4.0 h from LW (= the actual HW)
    assert result[6]["hour_from_lw"] == pytest.approx(4.0, rel=1e-3)
    # Heights are unchanged — same rule-of-12s fractions of the same range
    assert result[3]["estimated_height_m"] == pytest.approx(4.0 * 6 / 12, rel=1e-3)


def test_rule_of_twelfths_fractions_are_correct():
    sea = _sea(time(12, 0), time(6, 0), 12.0)
    result = TidalService.rule_of_twelfths(sea)
    # Rule of 12s: 1, 2, 3, 3, 2, 1 twelfths per hour
    expected_heights = [0.0, 1.0, 3.0, 6.0, 9.0, 11.0, 12.0]
    for i, entry in enumerate(result):
        assert entry["estimated_height_m"] == pytest.approx(expected_heights[i])


def test_rule_of_twelfths_returns_none_when_data_absent():
    assert TidalService.rule_of_twelfths(_sea(None, time(6, 0), 4.0)) is None
    assert TidalService.rule_of_twelfths(_sea(time(12, 0), None, 4.0)) is None
    assert TidalService.rule_of_twelfths(_sea(time(12, 0), time(6, 0), None)) is None


# ── height_at ────────────────────────────────────────────────────────────────

def test_height_at_returns_none_when_data_absent():
    assert TidalService.height_at(_sea(None, time(6, 0), 4.0), time(9, 0)) is None
    assert TidalService.height_at(_sea(time(12, 0), None, 4.0), time(9, 0)) is None
    assert TidalService.height_at(_sea(time(12, 0), time(6, 0), None), time(9, 0)) is None


def test_height_at_lw_is_zero():
    # LW=06:00, HW=12:00, range=4m — at LW height above LW = 0
    sea = _sea(time(12, 0), time(6, 0), 4.0)
    assert TidalService.height_at(sea, time(6, 0)) == pytest.approx(0.0)


def test_height_at_hw_is_range():
    # At HW, height above LW = tidal_range_m
    sea = _sea(time(12, 0), time(6, 0), 4.0)
    assert TidalService.height_at(sea, time(12, 0)) == pytest.approx(4.0)


def test_height_at_mid_flood():
    # LW=06:00, HW=12:00, t=09:00 → 3 h from LW → 6/12 of range = 2.0 m
    sea = _sea(time(12, 0), time(6, 0), 4.0)
    result = TidalService.height_at(sea, time(9, 0))
    assert result == pytest.approx(2.0)


def test_height_at_mid_ebb():
    # HW=06:00, LW=12:00, t=09:00 → 3 h from HW → range - 6/12 of range = 2.0 m
    sea = _sea(time(6, 0), time(12, 0), 4.0)
    result = TidalService.height_at(sea, time(9, 0))
    assert result == pytest.approx(2.0)


def test_height_at_proportional_scaling_short_flood():
    # 4-hour flood: LW=08:00, HW=12:00, range=4m, t=10:00 (2h from LW = 50% of flood)
    # scaled = 2/4 * 6 = 3 → height = 6/12 * 4 = 2.0 m (same midpoint fraction)
    sea = _sea(time(12, 0), time(8, 0), 4.0)
    assert TidalService.height_at(sea, time(10, 0)) == pytest.approx(2.0)


def test_height_at_proportional_scaling_long_flood():
    # 8-hour flood: LW=04:00, HW=12:00, range=4m, t=08:00 (4h from LW = 50% of flood)
    # scaled = 4/8 * 6 = 3 → height = 6/12 * 4 = 2.0 m
    sea = _sea(time(12, 0), time(4, 0), 4.0)
    assert TidalService.height_at(sea, time(8, 0)) == pytest.approx(2.0)


# ── interpolate_stream_rate ───────────────────────────────────────────────────

def test_interpolate_stream_rate_at_spring():
    # Actual range == spring range → ratio = 1.0 → spring rate
    sea = _sea(time(12, 0), time(6, 0), 4.0)
    entry = _entry(spring_rate=3.0, neap_rate=1.5, station=_station(mean_spring_range_m=4.0))
    result = TidalService.interpolate_stream_rate(entry, sea)
    assert result == pytest.approx(3.0)


def test_interpolate_stream_rate_at_neap():
    # Actual range is half spring → ratio = 0.5 → midpoint between neap and spring
    sea = _sea(time(12, 0), time(6, 0), 2.0)
    entry = _entry(spring_rate=3.0, neap_rate=1.0, station=_station(mean_spring_range_m=4.0))
    result = TidalService.interpolate_stream_rate(entry, sea)
    assert result == pytest.approx(1.0 + 0.5 * (3.0 - 1.0))


def test_interpolate_stream_rate_intermediate():
    # Actual range = 3/4 of spring → rate = neap + 0.75 * (spring - neap)
    sea = _sea(time(12, 0), time(6, 0), 3.0)
    entry = _entry(spring_rate=4.0, neap_rate=2.0, station=_station(mean_spring_range_m=4.0))
    result = TidalService.interpolate_stream_rate(entry, sea)
    assert result == pytest.approx(2.0 + 0.75 * (4.0 - 2.0))


def test_interpolate_stream_rate_no_spring_range_falls_back():
    sea = _sea(time(12, 0), time(6, 0), 4.0)
    entry = _entry(spring_rate=2.5, neap_rate=1.0, station=_station(mean_spring_range_m=None))
    assert TidalService.interpolate_stream_rate(entry, sea) == pytest.approx(2.5)


def test_interpolate_stream_rate_no_spring_rate_returns_none():
    sea = _sea(time(12, 0), time(6, 0), 4.0)
    entry = _entry(spring_rate=None, neap_rate=1.0, station=_station(mean_spring_range_m=4.0))
    assert TidalService.interpolate_stream_rate(entry, sea) is None


# ── tidal_gates_for_day (DB) ─────────────────────────────────────────────────

def test_tidal_gates_empty_when_no_stations_in_range(app, itinerary):
    """No TidalStation within 5 km → empty gate list."""
    day_id = itinerary["days"][0]["id"]
    day = _db.session.get(Day, UUID(day_id))

    geo = from_shape(ShapelyPoint(-4.15, 50.35), srid=4326)
    point = Point(latitude=50.35, longitude=-4.15, geo=geo, type=PointType.STOP, day_id=day.id)
    _db.session.add(point)
    _db.session.commit()

    sea = Sea(day_id=day.id, high_tide=time(6, 0), low_tide=time(12, 0), tidal_range_m=Decimal("4.0"))
    _db.session.add(sea)
    _db.session.commit()

    try:
        gates = TidalService.tidal_gates_for_day(day, [point], sea)
        assert gates == []
    finally:
        _db.session.delete(sea)
        _db.session.delete(point)
        _db.session.commit()


def test_tidal_gates_blocking_gate_detected(app, itinerary):
    """Station within 5 km with rate > 2 kn is flagged as blocking."""
    day_id = itinerary["days"][0]["id"]
    day = _db.session.get(Day, UUID(day_id))

    pt_lat, pt_lon = 50.35, -4.15
    geo = from_shape(ShapelyPoint(pt_lon, pt_lat), srid=4326)
    point = Point(latitude=pt_lat, longitude=pt_lon, geo=geo, type=PointType.STOP, day_id=day.id)
    _db.session.add(point)
    _db.session.flush()

    station_geo = from_shape(ShapelyPoint(pt_lon, pt_lat), srid=4326)
    station = TidalStation(name="Plymouth Sound Test", location=station_geo, mean_spring_range_m=Decimal("4.0"))
    _db.session.add(station)
    _db.session.flush()

    # 09:00 start, 0 nm cumulative → transit_min=540; HW at 06:00 → hours_from_hw = round((540-360)/60) = 3
    entry = TidalStreamEntry(
        station_id=station.id,
        hours_from_hw=3,
        direction_degrees=Decimal("270"),
        spring_rate_knots=Decimal("3.0"),
        neap_rate_knots=Decimal("1.5"),
    )
    _db.session.add(entry)

    sea = Sea(day_id=day.id, high_tide=time(6, 0), low_tide=time(12, 0), tidal_range_m=Decimal("4.0"))
    _db.session.add(sea)
    _db.session.commit()

    try:
        gates = TidalService.tidal_gates_for_day(day, [point], sea)
        assert len(gates) == 1
        gate = gates[0]
        assert gate["station_name"] == "Plymouth Sound Test"
        assert gate["is_blocking"] is True
        assert gate["rate_knots"] == pytest.approx(3.0)
        assert gate["direction_degrees"] == pytest.approx(270.0)
        assert gate["next_slack_utc"] is not None
    finally:
        _db.session.delete(sea)
        _db.session.delete(entry)
        _db.session.delete(station)
        _db.session.delete(point)
        _db.session.commit()


# ── height_at — secondary phase branches ─────────────────────────────────────

def test_height_at_ebb_after_hw_in_explicit_flood():
    # LW=06:00, HW=12:00 (explicit flood); t=15:00 is 3 h into the ebb after HW.
    sea = _sea(time(12, 0), time(6, 0), 4.0)
    assert TidalService.height_at(sea, time(15, 0)) == pytest.approx(2.0)


def test_height_at_before_lw_in_explicit_flood():
    # LW=06:00, HW=12:00; t=03:00 is before LW → ebb from the inferred preceding HW.
    sea = _sea(time(12, 0), time(6, 0), 4.0)
    result = TidalService.height_at(sea, time(3, 0))
    assert result is not None and 0.0 <= result <= 4.0


def test_height_at_before_hw_in_explicit_ebb():
    # HW=12:00, LW=18:00 (explicit ebb); t=09:00 is before HW → flood leading up to HW.
    sea = _sea(time(12, 0), time(18, 0), 4.0)
    result = TidalService.height_at(sea, time(9, 0))
    assert result is not None and 0.0 <= result <= 4.0


def test_height_at_after_lw_in_explicit_ebb():
    # HW=06:00, LW=12:00 (explicit ebb); t=15:00 is after LW → flood has resumed.
    sea = _sea(time(6, 0), time(12, 0), 4.0)
    result = TidalService.height_at(sea, time(15, 0))
    assert result is not None and 0.0 <= result <= 4.0


# ── build_wind_velocity_grid ─────────────────────────────────────────────────

def _wind_state(hour, wind_force, wind_direction):
    return types.SimpleNamespace(
        time=time(hour, 0), wind_force=wind_force, wind_direction=wind_direction
    )


def test_build_wind_velocity_grid_empty_when_no_states():
    result = TidalService.build_wind_velocity_grid((50.0, 51.0, -5.0, -4.0), [], 12)
    assert result == {"source": "weather", "grid": []}


def test_build_wind_velocity_grid_empty_when_force_or_direction_missing():
    states = [_wind_state(12, None, 90.0)]
    result = TidalService.build_wind_velocity_grid((50.0, 51.0, -5.0, -4.0), states, 12)
    assert result == {"source": "weather", "grid": []}


def test_build_wind_velocity_grid_happy_path_picks_closest_hour():
    states = [_wind_state(6, 18.0, 90.0), _wind_state(12, 36.0, 270.0)]
    result = TidalService.build_wind_velocity_grid((50.0, 51.0, -5.0, -4.0), states, 11)
    assert result["source"] == "weather"
    assert len(result["grid"]) == 2
    # 36 km/h ≈ 10 m/s blowing toward 270° → u dominates, eastward component non-zero
    east = next(g for g in result["grid"] if g["header"]["parameterNumberName"] == "eastward_component")
    assert east["data"][0] != 0.0
    nrth = next(g for g in result["grid"] if g["header"]["parameterNumberName"] == "northward_component")
    assert east["header"]["parameterCategory"] == 2
    assert east["header"]["parameterNumber"] == 2
    assert nrth["header"]["parameterCategory"] == 2
    assert nrth["header"]["parameterNumber"] == 3


# ── build_wave_velocity_grid ─────────────────────────────────────────────────

def _wave_state(hour, wave_height, wave_direction):
    return types.SimpleNamespace(
        time=time(hour, 0), wave_height=wave_height, wave_direction=wave_direction
    )


def test_build_wave_velocity_grid_empty_when_no_states():
    result = TidalService.build_wave_velocity_grid((50.0, 51.0, -5.0, -4.0), [], 12)
    assert result == {"source": "marine", "grid": []}


def test_build_wave_velocity_grid_empty_when_height_or_direction_missing():
    states = [_wave_state(12, 1.5, None)]
    result = TidalService.build_wave_velocity_grid((50.0, 51.0, -5.0, -4.0), states, 12)
    assert result == {"source": "marine", "grid": []}


def test_build_wave_velocity_grid_happy_path():
    states = [_wave_state(12, 2.0, 180.0)]
    result = TidalService.build_wave_velocity_grid((50.0, 51.0, -5.0, -4.0), states, 12)
    assert result["source"] == "marine"
    assert len(result["grid"]) == 2
    # 2 m toward 180° (south) → northward component negative
    north = next(g for g in result["grid"] if g["header"]["parameterNumberName"] == "northward_component")
    assert north["data"][0] < 0.0
    east2 = next(g for g in result["grid"] if g["header"]["parameterNumberName"] == "eastward_component")
    assert east2["header"]["parameterCategory"] == 2
    assert east2["header"]["parameterNumber"] == 2
    assert north["header"]["parameterCategory"] == 2
    assert north["header"]["parameterNumber"] == 3


# ── tidal_gates_for_day — skip branches ──────────────────────────────────────

def test_tidal_gates_empty_when_no_date(app, itinerary):
    day_id = itinerary["days"][0]["id"]
    day = _db.session.get(Day, UUID(day_id))
    day.date = None
    _db.session.flush()
    assert TidalService.tidal_gates_for_day(day, [], None) == []


def test_tidal_gates_skips_interest_and_coordless_points(app, itinerary):
    day_id = itinerary["days"][0]["id"]
    day = _db.session.get(Day, UUID(day_id))

    interest = Point(latitude=50.3, longitude=-4.1, type=PointType.INTEREST, day_id=day.id)
    no_coords = Point(latitude=None, longitude=None, type=PointType.STOP, day_id=day.id)
    no_geo = Point(latitude=50.3, longitude=-4.1, geo=None, type=PointType.STOP, day_id=day.id)
    _db.session.add_all([interest, no_coords, no_geo])
    _db.session.commit()

    try:
        gates = TidalService.tidal_gates_for_day(day, [interest, no_coords, no_geo], None)
        assert gates == []
    finally:
        _db.session.delete(interest)
        _db.session.delete(no_coords)
        _db.session.delete(no_geo)
        _db.session.commit()
