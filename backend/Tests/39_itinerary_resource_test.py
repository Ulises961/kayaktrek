"""HTTP-layer tests for itinerary resource: error branches + fork/export/import endpoints."""
from io import BytesIO

import pytest

from Resources.itinerary_resource import ITINERARY_ENDPOINT
from Resources.point_resource import POINT_ENDPOINT
from Resources.trip_resource import TRIP_ENDPOINT

_FAKE_UUID = "00000000-0000-7000-8000-000000000099"

_ROUTE_GPX = b"""<?xml version="1.0"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>Imported</name></metadata>
  <rte>
    <rtept lat="44.0" lon="8.5"><name>Start</name></rtept>
    <rtept lat="44.1" lon="8.6"><name>End</name></rtept>
  </rte>
</gpx>"""


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture(scope="function")
def public_itinerary(client, auth_headers):
    """Public itinerary with one geo-positioned point."""
    trip_resp = client.post(f"{TRIP_ENDPOINT}/create", json={"inventory": {}}, headers=auth_headers)
    assert trip_resp.status_code == 201
    trip_id = trip_resp.json["id"]

    itin_resp = client.post(f"{ITINERARY_ENDPOINT}/create",
                             json={"name": "Public Route", "tripId": trip_id},
                             headers=auth_headers)
    assert itin_resp.status_code == 201
    itin_id = itin_resp.json["id"]
    day0_id = next(d["id"] for d in itin_resp.json["days"] if d["dayNumber"] == 0)

    client.post(f"{POINT_ENDPOINT}/create", headers=auth_headers,
                json={"dayId": day0_id, "type": "stop",
                      "latitude": 44.0, "longitude": 8.5})

    client.patch(f"{ITINERARY_ENDPOINT}/{itin_id}", headers=auth_headers,
                 json={"isPublic": True})

    yield {"itinerary_id": itin_id, "trip_id": trip_id}

    try:
        client.delete(f"{ITINERARY_ENDPOINT}/{itin_id}", headers=auth_headers)
    except Exception:
        pass
    try:
        client.delete(f"{TRIP_ENDPOINT}/{trip_id}", headers=auth_headers)
    except Exception:
        pass


# ── GET /explore ──────────────────────────────────────────────────────────────

def test_get_explore_returns_200_list(client, public_itinerary):
    r = client.get(f"{ITINERARY_ENDPOINT}/explore")
    assert r.status_code == 200
    ids = [i["id"] for i in r.json]
    assert public_itinerary["itinerary_id"] in ids


# ── GET /<id>/public ──────────────────────────────────────────────────────────

def test_get_public_itinerary_returns_200(client, public_itinerary):
    r = client.get(f"{ITINERARY_ENDPOINT}/{public_itinerary['itinerary_id']}/public")
    assert r.status_code == 200
    assert r.json["id"] == public_itinerary["itinerary_id"]


def test_get_public_itinerary_private_returns_404(client, itinerary):
    r = client.get(f"{ITINERARY_ENDPOINT}/{itinerary['id']}/public")
    assert r.status_code == 404


# ── POST /create error branches ───────────────────────────────────────────────

def test_create_with_nonexistent_trip_returns_404(client, auth_headers):
    r = client.post(f"{ITINERARY_ENDPOINT}/create",
                    json={"tripId": _FAKE_UUID}, headers=auth_headers)
    assert r.status_code == 404


def test_create_standalone_missing_name_returns_400(client, auth_headers):
    r = client.post(f"{ITINERARY_ENDPOINT}/create", json={}, headers=auth_headers)
    assert r.status_code == 400


# ── PATCH /<id> error branches ────────────────────────────────────────────────

def test_update_validation_error_returns_400(client, auth_headers, itinerary):
    r = client.patch(f"{ITINERARY_ENDPOINT}/{itinerary['id']}",
                     json={"avgSpeedKnots": 0.1}, headers=auth_headers)
    assert r.status_code == 400


# ── POST /<id>/fork ───────────────────────────────────────────────────────────

def test_fork_public_itinerary_returns_201_with_id(client, auth_headers, public_itinerary):
    r = client.post(f"{ITINERARY_ENDPOINT}/{public_itinerary['itinerary_id']}/fork",
                    headers=auth_headers)
    assert r.status_code == 201
    fork_id = r.json.get("itineraryId")
    assert fork_id is not None
    client.delete(f"{ITINERARY_ENDPOINT}/{fork_id}", headers=auth_headers)


def test_fork_private_itinerary_returns_403(client, auth_headers, itinerary):
    r = client.post(f"{ITINERARY_ENDPOINT}/{itinerary['id']}/fork", headers=auth_headers)
    assert r.status_code == 403


def test_fork_nonexistent_itinerary_returns_404(client, auth_headers):
    r = client.post(f"{ITINERARY_ENDPOINT}/{_FAKE_UUID}/fork", headers=auth_headers)
    assert r.status_code == 404


# ── GET /<id>/export ──────────────────────────────────────────────────────────

def test_export_wrong_format_returns_400(client, auth_headers, itinerary):
    r = client.get(f"{ITINERARY_ENDPOINT}/{itinerary['id']}/export?format=csv",
                   headers=auth_headers)
    assert r.status_code == 400


def test_export_authenticated_owner_returns_gpx(client, auth_headers, public_itinerary):
    r = client.get(f"{ITINERARY_ENDPOINT}/{public_itinerary['itinerary_id']}/export?format=gpx",
                   headers=auth_headers)
    assert r.status_code == 200
    assert "gpx" in r.content_type


def test_export_unauthenticated_public_returns_gpx(client, public_itinerary):
    r = client.get(
        f"{ITINERARY_ENDPOINT}/{public_itinerary['itinerary_id']}/export?format=gpx"
    )
    assert r.status_code == 200
    assert "gpx" in r.content_type


def test_export_unauthenticated_private_returns_404(app, itinerary):
    with app.test_client() as fresh_client:
        r = fresh_client.get(f"{ITINERARY_ENDPOINT}/{itinerary['id']}/export?format=gpx")
    assert r.status_code == 404


def test_export_authenticated_owner_private_returns_gpx(client, auth_headers, itinerary):
    """Owner can export their own private itinerary — optional auth reads the request token."""
    r = client.get(f"{ITINERARY_ENDPOINT}/{itinerary['id']}/export?format=gpx",
                   headers=auth_headers)
    assert r.status_code == 200
    assert "gpx" in r.content_type


# ── POST /import ──────────────────────────────────────────────────────────────

def test_import_no_file_field_returns_400(client, auth_headers):
    r = client.post(f"{ITINERARY_ENDPOINT}/import", headers=auth_headers,
                    data={}, content_type="multipart/form-data")
    assert r.status_code == 400


def test_import_non_gpx_extension_returns_400(client, auth_headers):
    r = client.post(f"{ITINERARY_ENDPOINT}/import", headers=auth_headers,
                    data={"file": (BytesIO(b"data"), "route.txt")},
                    content_type="multipart/form-data")
    assert r.status_code == 400


def test_import_valid_gpx_returns_201_with_id(client, auth_headers):
    r = client.post(f"{ITINERARY_ENDPOINT}/import", headers=auth_headers,
                    data={"file": (BytesIO(_ROUTE_GPX), "route.gpx")},
                    content_type="multipart/form-data")
    assert r.status_code == 201
    itin_id = r.json.get("itineraryId")
    assert itin_id is not None
    client.delete(f"{ITINERARY_ENDPOINT}/{itin_id}", headers=auth_headers)


def test_import_oversized_file_returns_400(client, auth_headers):
    big = b"x" * (5 * 1024 * 1024 + 1)
    r = client.post(f"{ITINERARY_ENDPOINT}/import", headers=auth_headers,
                    data={"file": (BytesIO(big), "big.gpx")},
                    content_type="multipart/form-data")
    assert r.status_code == 400


# ── POST /<id>/apply-boundaries error branches ────────────────────────────────

def test_apply_boundaries_non_list_returns_400(client, auth_headers, itinerary):
    r = client.post(f"{ITINERARY_ENDPOINT}/{itinerary['id']}/apply-boundaries",
                    headers=auth_headers,
                    json={"boundaries": "not-a-list", "points": []})
    assert r.status_code == 400


def test_apply_boundaries_bad_point_returns_400(client, auth_headers, itinerary):
    day1_id = next(d["id"] for d in itinerary["days"] if d["dayNumber"] == 1)
    r = client.post(f"{ITINERARY_ENDPOINT}/{itinerary['id']}/apply-boundaries",
                    headers=auth_headers,
                    json={"boundaries": [{"dayId": day1_id, "startPointId": _FAKE_UUID,
                                          "endPointId": _FAKE_UUID, "date": None}],
                          "points": []})
    assert r.status_code == 400
