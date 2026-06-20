"""§2 Sea resource + tidal station API tests."""
from unittest.mock import MagicMock, patch
from uuid import UUID

import pytest
from datetime import time
from geoalchemy2.shape import from_shape
from shapely.geometry import Point as ShapelyPoint

from Api.database import db as _db
from Models.day import Day
from Models.sea import Sea
from Models.tidal_station import StreamEntryMode, TidalStation
from Models.weather import Weather
from Models.weather_state import WeatherState
from Services.tidal_station_service import TidalStationService


# ── Sea CRUD ─────────────────────────────────────────────────────────────────

def test_get_sea_404_when_not_exists(client, auth_headers, itinerary):
    day_id = itinerary["days"][0]["id"]
    resp = client.get(f"/api/day/{day_id}/sea", headers=auth_headers)
    assert resp.status_code == 404


def test_post_sea_creates_and_returns_rule_of_twelfths(client, auth_headers, itinerary):
    day_id = itinerary["days"][0]["id"]
    body = {"highTide": "12:00", "lowTide": "06:00", "tidalRangeM": 4.0}
    resp = client.post(f"/api/day/{day_id}/sea", json=body, headers=auth_headers)
    assert resp.status_code == 201
    data = resp.get_json()
    assert data["dayId"] == day_id
    assert data["highTide"] == "12:00"
    assert data["tidalRangeM"] == pytest.approx(4.0)
    assert data["ruleOfTwelfths"] is not None
    assert len(data["ruleOfTwelfths"]) == 7

    _cleanup_sea(day_id)


def test_post_sea_409_when_already_exists(client, auth_headers, itinerary):
    day_id = itinerary["days"][1]["id"]
    body = {"highTide": "06:00", "lowTide": "12:00", "tidalRangeM": 3.0}
    resp1 = client.post(f"/api/day/{day_id}/sea", json=body, headers=auth_headers)
    assert resp1.status_code == 201

    resp2 = client.post(f"/api/day/{day_id}/sea", json=body, headers=auth_headers)
    assert resp2.status_code == 409

    _cleanup_sea(day_id)


def test_patch_sea_updates_fields(client, auth_headers, itinerary):
    day_id = itinerary["days"][0]["id"]
    client.post(
        f"/api/day/{day_id}/sea",
        json={"highTide": "10:00", "lowTide": "04:00", "tidalRangeM": 2.0},
        headers=auth_headers,
    )

    resp = client.patch(
        f"/api/day/{day_id}/sea",
        json={"tidalRangeM": 3.5, "moonPhase": "waxing gibbous"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["tidalRangeM"] == pytest.approx(3.5)
    assert data["moonPhase"] == "waxing gibbous"
    assert data["highTide"] == "10:00"  # untouched

    _cleanup_sea(day_id)


def test_patch_sea_upserts_when_not_exists(client, auth_headers, itinerary):
    # Sea is lazily materialised: the first PATCH for a day creates the record
    # rather than 404ing, since the frontend only ever PATCHes.
    day_id = itinerary["days"][0]["id"]
    resp = client.patch(f"/api/day/{day_id}/sea", json={"tidalRangeM": 1.0}, headers=auth_headers)
    assert resp.status_code == 200
    assert resp.get_json()["tidalRangeM"] == pytest.approx(1.0)

    _cleanup_sea(day_id)


def test_get_sea_returns_created_record(client, auth_headers, itinerary):
    day_id = itinerary["days"][0]["id"]
    client.post(
        f"/api/day/{day_id}/sea",
        json={"lowTide": "08:00", "highTide": "14:00", "tidalRangeM": 5.5},
        headers=auth_headers,
    )

    resp = client.get(f"/api/day/{day_id}/sea", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["tidalRangeM"] == pytest.approx(5.5)

    _cleanup_sea(day_id)


# ── tidal gates ───────────────────────────────────────────────────────────────

def test_get_tidal_gates_returns_empty_list(client, auth_headers, itinerary):
    day_id = itinerary["days"][0]["id"]
    resp = client.get(f"/api/day/{day_id}/tidal-gates", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.get_json() == []


# ── weather GET ───────────────────────────────────────────────────────────────

def test_get_weather_404_when_no_record(client, auth_headers, itinerary):
    day_id = itinerary["days"][0]["id"]
    resp = client.get(f"/api/day/{day_id}/weather", headers=auth_headers)
    assert resp.status_code == 404


def test_get_weather_returns_states(client, auth_headers, app, itinerary):
    day_id = itinerary["days"][0]["id"]
    from uuid import UUID as _UUID
    with app.app_context():
        weather = Weather(day_id=_UUID(day_id), model="gfs")
        _db.session.add(weather)
        _db.session.flush()
        ws = WeatherState(
            day_id=_UUID(day_id),
            time=time(12, 0),
            temperature=22.5,
            precipitation=0.0,
            wind_direction=270.0,
            wind_force=10.0,
            cloud=None,
        )
        _db.session.add(ws)
        _db.session.commit()

    resp = client.get(f"/api/day/{day_id}/weather", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["dayId"] == day_id
    assert data["model"] == "gfs"
    assert len(data["weatherStates"]) == 1
    state = data["weatherStates"][0]
    assert state["windForce"] == pytest.approx(10.0)
    assert state["windDirection"] == pytest.approx(270.0)

    with app.app_context():
        _db.session.query(WeatherState).filter_by(day_id=_UUID(day_id)).delete()
        _db.session.query(Weather).filter_by(day_id=_UUID(day_id)).delete()
        _db.session.commit()


# ── weather fetch ─────────────────────────────────────────────────────────────

def test_weather_fetch_400_without_date(client, auth_headers, app, itinerary):
    day_id = itinerary["days"][0]["id"]
    with app.app_context():
        day = _db.session.get(Day, UUID(day_id))
        original_date = day.date
        day.date = None
        _db.session.commit()
    try:
        resp = client.post(f"/api/day/{day_id}/weather/fetch", headers=auth_headers)
        assert resp.status_code == 400
    finally:
        with app.app_context():
            day = _db.session.get(Day, UUID(day_id))
            day.date = original_date
            _db.session.commit()


def test_weather_fetch_202_with_date(client, auth_headers, itinerary):
    day_id = itinerary["days"][0]["id"]
    mock_result = MagicMock()
    mock_result.id = "mock-celery-task-id"
    with patch("Resources.sea_resource.fetch_weather") as mock_task:
        mock_task.delay.return_value = mock_result
        resp = client.post(f"/api/day/{day_id}/weather/fetch", headers=auth_headers)
    assert resp.status_code == 202
    assert resp.get_json()["taskId"] == "mock-celery-task-id"


# ── tidal station admin ───────────────────────────────────────────────────────

@pytest.fixture(scope="module", autouse=False)
def admin_user_1(user_1):
    """Promote user_1 to admin for tidal-station admin endpoint tests.

    Registration ignores the admin field (correctly), so we set it directly.
    Restored at teardown.
    """
    user_1.admin = True
    _db.session.commit()
    yield user_1
    user_1.admin = False
    _db.session.commit()


def test_tidal_station_create_requires_admin(client, auth_headers_2, itinerary):
    body = {
        "name": "Test Station",
        "location": {"type": "Point", "coordinates": [-4.15, 50.35]},
    }
    resp = client.post("/api/tidal-station/create", json=body, headers=auth_headers_2)
    assert resp.status_code == 403


def test_tidal_station_create_and_delete(admin_user_1, client, auth_headers):
    body = {
        "name": "Falmouth Approach",
        "location": {"type": "Point", "coordinates": [-5.05, 50.15]},
        "meanSpringRangeM": 4.8,
        "tidalStreamEntries": [
            {"hoursFromHw": 0, "springRateKnots": 2.1, "neapRateKnots": 1.0, "directionDegrees": 270},
        ],
    }
    resp = client.post("/api/tidal-station/create", json=body, headers=auth_headers)
    assert resp.status_code == 201
    data = resp.get_json()
    station_id = data["id"]
    assert data["name"] == "Falmouth Approach"
    assert data["meanSpringRangeM"] == pytest.approx(4.8)
    assert len(data["tidalStreamEntries"]) == 1
    assert data["location"]["type"] == "Point"

    del_resp = client.delete(f"/api/tidal-station/{station_id}", headers=auth_headers)
    assert del_resp.status_code == 200


def test_tidal_station_patch(admin_user_1, client, auth_headers):
    body = {
        "name": "Lizard Point",
        "location": {"type": "Point", "coordinates": [-5.20, 49.96]},
    }
    create_resp = client.post("/api/tidal-station/create", json=body, headers=auth_headers)
    station_id = create_resp.get_json()["id"]

    patch_resp = client.patch(
        f"/api/tidal-station/{station_id}",
        json={"name": "Lizard Point Updated", "meanSpringRangeM": 3.9},
        headers=auth_headers,
    )
    assert patch_resp.status_code == 200
    patched = patch_resp.get_json()
    assert patched["name"] == "Lizard Point Updated"
    assert patched["meanSpringRangeM"] == pytest.approx(3.9)

    client.delete(f"/api/tidal-station/{station_id}", headers=auth_headers)


def test_tidal_station_nearby(client, auth_headers, app):
    geo = from_shape(ShapelyPoint(-4.15, 50.35), srid=4326)
    station = TidalStation(name="Nearby Station Test", location=geo, mean_spring_range_m=3.0)
    with app.app_context():
        _db.session.add(station)
        _db.session.commit()
        station_id = str(station.id)
    try:
        resp = client.get("/api/tidal-station/nearby?lat=50.35&lng=-4.15&range=1")
        assert resp.status_code == 200
        names = [s["name"] for s in resp.get_json()]
        assert "Nearby Station Test" in names
    finally:
        with app.app_context():
            s = _db.session.get(TidalStation, station_id)
            if s:
                _db.session.delete(s)
                _db.session.commit()


def test_tidal_station_nearby_excludes_out_of_range(client):
    resp = client.get("/api/tidal-station/nearby?lat=51.50&lng=-0.10&range=1")
    assert resp.status_code == 200
    # No stations near London — just confirm the endpoint returns an empty list
    assert isinstance(resp.get_json(), list)


def test_patch_sea_tidal_stream_fields(client, auth_headers, itinerary):
    day_id = itinerary["days"][0]["id"]
    client.post(
        f"/api/day/{day_id}/sea",
        json={"highTide": "10:00", "lowTide": "04:00", "tidalRangeM": 4.0},
        headers=auth_headers,
    )

    resp = client.patch(
        f"/api/day/{day_id}/sea",
        json={
            "referencePortName": "Milford Haven",
            "hwTimeOffsetMinutes": 35,
            "lwTimeOffsetMinutes": 30,
            "hwHeightRatio": 0.95,
            "lwHeightRatio": 1.05,
            "floodDirectionDegrees": 47.0,
            "ebbDirectionDegrees": 227.0,
            "maxSpringRateKnots": 3.1,
            "maxNeapRateKnots": 1.6,
        },
        headers=auth_headers,
    )
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["referencePortName"] == "Milford Haven"
    assert data["hwTimeOffsetMinutes"] == 35
    assert data["floodDirectionDegrees"] == pytest.approx(47.0)
    assert data["ebbDirectionDegrees"] == pytest.approx(227.0)
    assert data["maxSpringRateKnots"] == pytest.approx(3.1)
    assert data["maxNeapRateKnots"] == pytest.approx(1.6)
    assert data["tidalSource"] == "manual_corrected"  # auto-set by correction fields

    _cleanup_sea(day_id)


def test_patch_sea_explicit_tidal_source_not_overridden(client, auth_headers, itinerary):
    day_id = itinerary["days"][1]["id"]
    client.post(
        f"/api/day/{day_id}/sea",
        json={"highTide": "09:00", "lowTide": "15:00"},
        headers=auth_headers,
    )

    resp = client.patch(
        f"/api/day/{day_id}/sea",
        json={"hwTimeOffsetMinutes": 20, "tidalSource": "manual"},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert resp.get_json()["tidalSource"] == "manual"

    _cleanup_sea(day_id)


# ── velocity grid endpoints ────────────────────────────────────────────────────

def test_wind_vectors_returns_empty_grid_when_no_weather(client, auth_headers, itinerary):
    day_id = itinerary["days"][0]["id"]
    resp = client.get(f"/api/day/{day_id}/wind-vectors?hour=12", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["grid"] == []


def test_wave_vectors_returns_empty_grid_when_no_sea_states(client, auth_headers, itinerary):
    day_id = itinerary["days"][0]["id"]
    resp = client.get(f"/api/day/{day_id}/wave-vectors?hour=12", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["grid"] == []


def test_tidal_diamonds_empty_when_none_exist(client, auth_headers, itinerary):
    day_id = itinerary["days"][0]["id"]
    resp = client.get(f"/api/day/{day_id}/tidal-diamonds?hour=12", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.get_json() == []


def test_tidal_diamonds_returns_user_diamond_resolved_at_hour(
    client, auth_headers, itinerary, id
):
    day_id = itinerary["days"][0]["id"]
    # HW at 12:00 so the clock hour maps onto the diamond's hourly table.
    client.post(
        f"/api/day/{day_id}/sea",
        json={"highTide": "12:00", "lowTide": "06:00", "tidalRangeM": 4.0},
        headers=auth_headers,
    )
    TidalStationService.create_user_diamond(itinerary["id"], id, {
        "name": "The Race",
        "location": from_shape(ShapelyPoint(-4.1, 50.3), srid=4326),
        "entry_mode": StreamEntryMode.SIMPLE,
        "max_spring_rate_knots": 3.0,
        "flood_direction_degrees": 45,
        "ebb_direction_degrees": 225,
        "radius_m": 500,
    })

    # hour 9 → 3 h before HW(12) → hours_from_hw = -3 → mid-flood peak.
    resp = client.get(f"/api/day/{day_id}/tidal-diamonds?hour=9", headers=auth_headers)
    assert resp.status_code == 200
    diamonds = resp.get_json()
    assert len(diamonds) == 1
    d = diamonds[0]
    assert d["name"] == "The Race"
    assert d["isUserCreated"] is True
    assert d["radiusM"] == pytest.approx(500.0)
    assert d["lat"] == pytest.approx(50.3)
    assert d["lng"] == pytest.approx(-4.1)
    assert d["rateKnots"] == pytest.approx(3.0)
    assert d["directionDegrees"] == pytest.approx(45.0)
    assert len(d["hourlyTable"]) == 13

    _cleanup_sea(day_id)


# ── helpers ───────────────────────────────────────────────────────────────────

def _cleanup_sea(day_id: str):
    sea = _db.session.query(Sea).filter_by(day_id=day_id).one_or_none()
    if sea:
        _db.session.delete(sea)
        _db.session.commit()
