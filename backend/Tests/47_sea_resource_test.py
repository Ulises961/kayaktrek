"""HTTP-layer tests for the sea resource — sea CRUD validation, tidal-gates,
the wind/wave velocity-vector endpoints, and the day tidal-diamonds endpoint
(including the branch where the day has route points with coordinates).
"""
import pytest

from Resources.point_resource import POINT_ENDPOINT

SEA_BASE = "/api/day"


def _day(itinerary, day_number):
    return next(d for d in itinerary["days"] if d["dayNumber"] == day_number)


@pytest.fixture(scope="function")
def day_with_points(client, auth_headers, itinerary):
    """A day carrying two geo-positioned route points."""
    day = _day(itinerary, 1)
    for lat, lng in [(50.30, -4.15), (50.35, -4.10)]:
        client.post(f"{POINT_ENDPOINT}/create", headers=auth_headers, json={
            "dayId": day["id"], "type": "position", "latitude": lat, "longitude": lng,
        })
    return day


# ── sea CRUD ─────────────────────────────────────────────────────────────────

def test_create_sea_happy_returns_201(client, auth_headers, itinerary):
    day = _day(itinerary, 1)
    resp = client.post(f"{SEA_BASE}/{day['id']}/sea", headers=auth_headers,
                       json={"moonPhase": "full", "highTide": "06:30", "lowTide": "12:45"})
    assert resp.status_code == 201
    assert resp.json["moonPhase"] == "full"


def test_create_sea_validation_error_returns_400(client, auth_headers, itinerary):
    day = _day(itinerary, 2)
    resp = client.post(f"{SEA_BASE}/{day['id']}/sea", headers=auth_headers,
                       json={"highTide": "not-a-time"})
    assert resp.status_code == 400


def test_get_sea_happy_returns_200(client, auth_headers, itinerary):
    day = _day(itinerary, 1)
    client.post(f"{SEA_BASE}/{day['id']}/sea", headers=auth_headers,
                json={"moonPhase": "new"})
    resp = client.get(f"{SEA_BASE}/{day['id']}/sea", headers=auth_headers)
    assert resp.status_code == 200


def test_get_sea_not_found_returns_404(client, auth_headers, itinerary):
    day = _day(itinerary, 2)
    resp = client.get(f"{SEA_BASE}/{day['id']}/sea", headers=auth_headers)
    assert resp.status_code == 404


def test_update_sea_happy_returns_200(client, auth_headers, itinerary):
    day = _day(itinerary, 1)
    client.post(f"{SEA_BASE}/{day['id']}/sea", headers=auth_headers, json={"moonPhase": "new"})
    resp = client.patch(f"{SEA_BASE}/{day['id']}/sea", headers=auth_headers,
                        json={"moonPhase": "waxing"})
    assert resp.status_code == 200
    assert resp.json["moonPhase"] == "waxing"


def test_update_sea_validation_error_returns_400(client, auth_headers, itinerary):
    day = _day(itinerary, 1)
    client.post(f"{SEA_BASE}/{day['id']}/sea", headers=auth_headers, json={"moonPhase": "new"})
    resp = client.patch(f"{SEA_BASE}/{day['id']}/sea", headers=auth_headers,
                        json={"highTide": "99:99"})
    assert resp.status_code == 400


# ── tidal gates + vector endpoints ───────────────────────────────────────────

def test_get_tidal_gates_returns_200(client, auth_headers, day_with_points):
    resp = client.get(f"{SEA_BASE}/{day_with_points['id']}/tidal-gates", headers=auth_headers)
    assert resp.status_code == 200
    assert isinstance(resp.json, list)


def test_wind_vectors_returns_200(client, auth_headers, day_with_points):
    resp = client.get(f"{SEA_BASE}/{day_with_points['id']}/wind-vectors?hour=9",
                      headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json["source"] == "weather"


def test_wave_vectors_returns_200(client, auth_headers, day_with_points):
    resp = client.get(f"{SEA_BASE}/{day_with_points['id']}/wave-vectors?hour=9",
                      headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json["source"] == "marine"


def test_tidal_diamonds_with_points_returns_200(client, auth_headers, day_with_points):
    """Day has coords → exercises the nearby-atlas spatial-query branch."""
    resp = client.get(f"{SEA_BASE}/{day_with_points['id']}/tidal-diamonds?hour=12",
                      headers=auth_headers)
    assert resp.status_code == 200
    assert isinstance(resp.json, list)
