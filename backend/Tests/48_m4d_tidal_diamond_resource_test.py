"""§4 prerequisite — HTTP layer for user-created tidal diamonds:
create (itinerary-scoped) + patch/delete (by station id), with the
itinerary-ownership authorisation chain."""
from uuid import uuid4

import pytest
from geoalchemy2.shape import from_shape
from shapely.geometry import Point as ShapelyPoint

from Api.database import db as _db
from Models.tidal_station import TidalStation

DIAMOND_BASE = "/api/v1/tidal-diamond"


def _simple_body(itinerary, **overrides):
    body = {
        "itineraryId": itinerary["id"],
        "name": "The Race",
        "location": {"type": "Point", "coordinates": [-4.1, 50.3]},
        "entryMode": "simple",
        "maxSpringRateKnots": 3.0,
        "floodDirectionDegrees": 45,
        "ebbDirectionDegrees": 225,
        "radiusM": 500,
    }
    body.update(overrides)
    return body


def _create(client, headers, itinerary, **overrides):
    return client.post(f"{DIAMOND_BASE}/create", json=_simple_body(itinerary, **overrides),
                       headers=headers)


# ── create ───────────────────────────────────────────────────────────────────

def test_create_simple_diamond_returns_201_with_synthesised_table(client, auth_headers, itinerary):
    resp = _create(client, auth_headers, itinerary)
    assert resp.status_code == 201
    data = resp.get_json()
    assert data["id"]
    assert data["name"] == "The Race"
    assert len(data["tidalStreamEntries"]) == 13


def test_create_advanced_diamond_stores_supplied_table(client, auth_headers, itinerary):
    rows = [{"hoursFromHw": h, "directionDegrees": 90, "springRateKnots": 2.0, "neapRateKnots": 1.0}
            for h in range(-6, 7)]
    resp = _create(client, auth_headers, itinerary, entryMode="atlas",
                   maxSpringRateKnots=None, floodDirectionDegrees=None,
                   ebbDirectionDegrees=None, tidalStreamEntries=rows)
    assert resp.status_code == 201
    assert len(resp.get_json()["tidalStreamEntries"]) == 13


def test_create_simple_missing_peak_fields_returns_400(client, auth_headers, itinerary):
    resp = _create(client, auth_headers, itinerary, maxSpringRateKnots=None)
    assert resp.status_code == 400


def test_create_missing_itinerary_id_returns_400(client, auth_headers, itinerary):
    body = _simple_body(itinerary)
    del body["itineraryId"]
    resp = client.post(f"{DIAMOND_BASE}/create", json=body, headers=auth_headers)
    assert resp.status_code == 400


def test_create_on_unowned_itinerary_returns_403(client, auth_headers_2, itinerary):
    resp = _create(client, auth_headers_2, itinerary)
    assert resp.status_code == 403


def test_create_requires_auth(client, itinerary):
    resp = client.post(f"{DIAMOND_BASE}/create", json=_simple_body(itinerary))
    assert resp.status_code in (401, 403)


# ── get (raw edit view) ───────────────────────────────────────────────────────

def test_get_simple_diamond_returns_raw_edit_view(client, auth_headers, itinerary):
    diamond_id = _create(client, auth_headers, itinerary).get_json()["id"]
    resp = client.get(f"{DIAMOND_BASE}/{diamond_id}", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.get_json()
    assert data["entryMode"] == "simple"
    assert data["maxSpringRateKnots"] == pytest.approx(3.0)
    assert data["floodDirectionDegrees"] == pytest.approx(45)
    assert data["ebbDirectionDegrees"] == pytest.approx(225)
    assert len(data["tidalStreamEntries"]) == 13


def test_get_nonexistent_returns_404(client, auth_headers):
    resp = client.get(f"{DIAMOND_BASE}/{uuid4()}", headers=auth_headers)
    assert resp.status_code == 404


def test_get_global_station_returns_403(client, auth_headers):
    station = TidalStation(name="Seeded", location=from_shape(ShapelyPoint(-4.0, 50.0), srid=4326))
    _db.session.add(station)
    _db.session.commit()
    try:
        resp = client.get(f"{DIAMOND_BASE}/{station.id}", headers=auth_headers)
        assert resp.status_code == 403
    finally:
        _db.session.delete(station)
        _db.session.commit()


def test_get_by_non_member_returns_403(client, auth_headers, auth_headers_2, itinerary):
    diamond_id = _create(client, auth_headers, itinerary).get_json()["id"]
    resp = client.get(f"{DIAMOND_BASE}/{diamond_id}", headers=auth_headers_2)
    assert resp.status_code == 403


# ── patch ────────────────────────────────────────────────────────────────────

def test_patch_renames_without_rebuilding_entries(client, auth_headers, itinerary):
    diamond_id = _create(client, auth_headers, itinerary).get_json()["id"]
    resp = client.patch(f"{DIAMOND_BASE}/{diamond_id}", json={"notes": "ebb sets E"},
                        headers=auth_headers)
    assert resp.status_code == 200
    assert resp.get_json()["notes"] == "ebb sets E"


def test_patch_reposition_updates_location(client, auth_headers, itinerary):
    diamond_id = _create(client, auth_headers, itinerary).get_json()["id"]
    resp = client.patch(f"{DIAMOND_BASE}/{diamond_id}",
                        json={"location": {"type": "Point", "coordinates": [-4.5, 50.6]}},
                        headers=auth_headers)
    assert resp.status_code == 200
    assert resp.get_json()["location"]["coordinates"] == pytest.approx([-4.5, 50.6])


def test_patch_rate_change_resynthesises_peak(client, auth_headers, itinerary):
    diamond_id = _create(client, auth_headers, itinerary).get_json()["id"]
    resp = client.patch(f"{DIAMOND_BASE}/{diamond_id}",
                        json={"maxSpringRateKnots": 6.0, "floodDirectionDegrees": 45,
                              "ebbDirectionDegrees": 225},
                        headers=auth_headers)
    assert resp.status_code == 200
    entries = {e["hoursFromHw"]: e for e in resp.get_json()["tidalStreamEntries"]}
    assert entries[-3]["springRateKnots"] == pytest.approx(6.0)


def test_patch_nonexistent_returns_404(client, auth_headers):
    resp = client.patch(f"{DIAMOND_BASE}/{uuid4()}", json={"notes": "x"}, headers=auth_headers)
    assert resp.status_code == 404


def test_patch_global_station_returns_403(client, auth_headers):
    station = TidalStation(name="Seeded", location=from_shape(ShapelyPoint(-4.0, 50.0), srid=4326))
    _db.session.add(station)
    _db.session.commit()
    try:
        resp = client.patch(f"{DIAMOND_BASE}/{station.id}", json={"notes": "x"},
                            headers=auth_headers)
        assert resp.status_code == 403
    finally:
        _db.session.delete(station)
        _db.session.commit()


def test_patch_by_non_member_returns_403(client, auth_headers, auth_headers_2, itinerary):
    diamond_id = _create(client, auth_headers, itinerary).get_json()["id"]
    resp = client.patch(f"{DIAMOND_BASE}/{diamond_id}", json={"notes": "x"},
                        headers=auth_headers_2)
    assert resp.status_code == 403


# ── delete ───────────────────────────────────────────────────────────────────

def test_delete_removes_diamond(client, auth_headers, itinerary):
    diamond_id = _create(client, auth_headers, itinerary).get_json()["id"]
    resp = client.delete(f"{DIAMOND_BASE}/{diamond_id}", headers=auth_headers)
    assert resp.status_code == 200
    assert _db.session.get(TidalStation, diamond_id) is None


def test_delete_nonexistent_returns_404(client, auth_headers):
    resp = client.delete(f"{DIAMOND_BASE}/{uuid4()}", headers=auth_headers)
    assert resp.status_code == 404


def test_delete_by_non_member_returns_403(client, auth_headers, auth_headers_2, itinerary):
    diamond_id = _create(client, auth_headers, itinerary).get_json()["id"]
    resp = client.delete(f"{DIAMOND_BASE}/{diamond_id}", headers=auth_headers_2)
    assert resp.status_code == 403
