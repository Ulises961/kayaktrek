"""M27 WP3 — the shared, position-only cross-trip view of tidal and wind
diamonds (GET /api/v1/hazard-diamond/nearby). Asserts on the raw JSON key
set, not just typed fields, so a schema rename can't silently leak content
(docs/adr/features.md "Revision (M27): position-only diamond sharing")."""
from geoalchemy2.shape import from_shape
from shapely.geometry import Point as ShapelyPoint

from Api.database import db as _db
from Models.tidal_station import TidalStation

HAZARD_BASE = "/api/v1/hazard-diamond"


def _point(lon, lat):
    return {"type": "Point", "coordinates": [lon, lat]}


def _create_tidal_diamond(client, headers, itinerary, **overrides):
    body = {
        "itineraryId": itinerary["id"],
        "name": "The Race",
        "location": _point(-4.1, 50.3),
        "entryMode": "simple",
        "maxSpringRateKnots": 3.0,
        "floodDirectionDegrees": 45,
        "ebbDirectionDegrees": 225,
    }
    body.update(overrides)
    return client.post("/api/v1/tidal-diamond/create", json=body, headers=headers).get_json()


def _create_wind_diamond(client, headers, itinerary, **overrides):
    body = {
        "itineraryId": itinerary["id"],
        "name": "Funnel off the ridge",
        "location": _point(-4.1, 50.3),
        "notes": "Katabatic gusts",
    }
    body.update(overrides)
    return client.post("/api/v1/wind-diamond/create", json=body, headers=headers).get_json()


def test_nearby_requires_auth(client):
    resp = client.get(f"{HAZARD_BASE}/nearby?lat=50.3&lng=-4.1&range=5")
    assert resp.status_code in (401, 403)


def test_nearby_missing_coords_returns_400(client, auth_headers):
    resp = client.get(f"{HAZARD_BASE}/nearby", headers=auth_headers)
    assert resp.status_code == 400


def test_nearby_out_of_range_coords_returns_400(client, auth_headers):
    resp = client.get(f"{HAZARD_BASE}/nearby?lat=200&lng=10", headers=auth_headers)
    assert resp.status_code == 400


def test_other_trips_diamonds_surface_position_only(
    client, auth_headers, auth_headers_2, itinerary
):
    """A tidal + wind diamond both owned by one trip must appear in a
    different, non-member user's call as bare {id, lat, lng, kind} — never
    name/notes/rate/direction/hourlyTable, whichever schema key they'd carry."""
    tidal = _create_tidal_diamond(client, auth_headers, itinerary)
    wind = _create_wind_diamond(client, auth_headers, itinerary)

    resp = client.get(f"{HAZARD_BASE}/nearby?lat=50.3&lng=-4.1&range=1", headers=auth_headers_2)
    assert resp.status_code == 200
    rows = {row["id"]: row for row in resp.get_json()}

    assert tidal["id"] in rows
    assert wind["id"] in rows

    for diamond_id in (tidal["id"], wind["id"]):
        row = rows[diamond_id]
        assert set(row) == {"id", "lat", "lng", "kind"}
        for forbidden_key in (
            "name", "notes", "source", "rate", "rateKnots", "direction", "directionDegrees",
            "hourlyTable", "tidalStreamEntries", "isUserCreated", "itineraryId", "createdByUserId",
        ):
            assert forbidden_key not in row

    assert rows[tidal["id"]]["kind"] == "tidal"
    assert rows[wind["id"]]["kind"] == "wind"


def test_positions_do_surface_cross_trip_not_just_get_hidden(
    client, auth_headers, auth_headers_2, itinerary
):
    """A redaction bug that hides everything would pass a "no content leaked"
    check vacuously — assert the position actually appears, at the right
    coordinates, for a caller with no relation to the owning trip."""
    wind = _create_wind_diamond(client, auth_headers, itinerary, name="Should not leak")

    resp = client.get(f"{HAZARD_BASE}/nearby?lat=50.3&lng=-4.1&range=1", headers=auth_headers_2)
    assert resp.status_code == 200
    row = next(r for r in resp.get_json() if r["id"] == wind["id"])
    assert row["lat"] == 50.3
    assert row["lng"] == -4.1


def test_own_trips_diamond_also_position_only_here(client, auth_headers, itinerary):
    """This endpoint is deliberately position-only for every caller, including
    the owner — full content for one's own diamonds comes from the dedicated
    tidal-diamond/wind-diamond CRUD endpoints, not this shared surface."""
    wind = _create_wind_diamond(client, auth_headers, itinerary)

    resp = client.get(f"{HAZARD_BASE}/nearby?lat=50.3&lng=-4.1&range=1", headers=auth_headers)
    assert resp.status_code == 200
    row = next(r for r in resp.get_json() if r["id"] == wind["id"])
    assert set(row) == {"id", "lat", "lng", "kind"}


def test_atlas_seeded_tidal_station_excluded(client, auth_headers):
    """Atlas-seeded stations (no owning itinerary) already have a full-content
    public path via GET /tidal-station/nearby — they don't need to appear
    again, position-only, on this shared surface."""
    station = TidalStation(name="Seeded", location=from_shape(ShapelyPoint(-4.1, 50.3), srid=4326))
    _db.session.add(station)
    _db.session.commit()
    try:
        resp = client.get(f"{HAZARD_BASE}/nearby?lat=50.3&lng=-4.1&range=1", headers=auth_headers)
        assert resp.status_code == 200
        assert str(station.id) not in {row["id"] for row in resp.get_json()}
    finally:
        _db.session.delete(station)
        _db.session.commit()
