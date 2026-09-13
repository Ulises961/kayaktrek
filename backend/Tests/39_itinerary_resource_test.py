"""HTTP-layer tests for itinerary resource: error branches + fork/export/import endpoints."""
from io import BytesIO

import pytest

from Resources.itinerary_resource import ITINERARY_ENDPOINT
from Resources.day_resource import DAY_ENDPOINT
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
    ids = [i["id"] for i in r.json["items"]]
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


# ── POST /<id>/staging-day ────────────────────────────────────────────────────

def test_provision_staging_day_returns_the_existing_day_zero(client, auth_headers, itinerary):
    """Idempotent: an itinerary created the normal way already has a Day 0, and
    asking for one hands back that same row rather than a second."""
    first = client.post(f"{ITINERARY_ENDPOINT}/{itinerary['id']}/staging-day",
                        headers=auth_headers)
    assert first.status_code == 200
    assert first.json["dayNumber"] == 0

    second = client.post(f"{ITINERARY_ENDPOINT}/{itinerary['id']}/staging-day",
                         headers=auth_headers)
    assert second.status_code == 200
    assert second.json["id"] == first.json["id"]

    days = client.get(f"{ITINERARY_ENDPOINT}/{itinerary['id']}", headers=auth_headers).json["days"]
    assert len([d for d in days if d["dayNumber"] == 0]) == 1


def test_provision_staging_day_recreates_a_missing_day_zero(client, auth_headers, itinerary):
    """The builder's repair path: without a Day 0 the map silently refuses every
    dropped point, so it asks for one rather than returning from the click handler."""
    day0_id = next(
        d["id"]
        for d in client.get(f"{ITINERARY_ENDPOINT}/{itinerary['id']}",
                            headers=auth_headers).json["days"]
        if d["dayNumber"] == 0
    )
    assert client.delete(f"{DAY_ENDPOINT}/{day0_id}", headers=auth_headers).status_code in (200, 204)

    restored = client.post(f"{ITINERARY_ENDPOINT}/{itinerary['id']}/staging-day",
                           headers=auth_headers)
    assert restored.status_code == 200
    assert restored.json["dayNumber"] == 0
    assert restored.json["id"] != day0_id  # genuinely a new row, not the deleted one

    # And a point can be dropped into it — the whole reason it has to exist.
    created = client.post(f"{POINT_ENDPOINT}/create", headers=auth_headers,
                          json={"dayId": restored.json["id"], "type": "position",
                                "latitude": 44.2, "longitude": 8.7})
    assert created.status_code == 201


def test_provision_staging_day_for_other_users_itinerary_returns_403(
    client, auth_headers_2, itinerary
):
    r = client.post(f"{ITINERARY_ENDPOINT}/{itinerary['id']}/staging-day",
                    headers=auth_headers_2)
    assert r.status_code == 403


def test_provision_staging_day_nonexistent_returns_404(client, auth_headers):
    r = client.post(f"{ITINERARY_ENDPOINT}/{_FAKE_UUID}/staging-day", headers=auth_headers)
    assert r.status_code == 404


# ── POST /<id>/fork ───────────────────────────────────────────────────────────

def test_fork_public_itinerary_returns_201_with_id(client, auth_headers_2, public_itinerary):
    # A different user than the author forks the public route.
    r = client.post(f"{ITINERARY_ENDPOINT}/{public_itinerary['itinerary_id']}/fork",
                    headers=auth_headers_2)
    assert r.status_code == 201
    fork_id = r.json.get("itineraryId")
    assert fork_id is not None
    client.delete(f"{ITINERARY_ENDPOINT}/{fork_id}", headers=auth_headers_2)


def test_fork_private_itinerary_returns_403(client, auth_headers, itinerary):
    r = client.post(f"{ITINERARY_ENDPOINT}/{itinerary['id']}/fork", headers=auth_headers)
    assert r.status_code == 403


def test_fork_own_itinerary_returns_403(client, auth_headers, public_itinerary):
    # The author forking their own route is rejected — it would duplicate it.
    r = client.post(f"{ITINERARY_ENDPOINT}/{public_itinerary['itinerary_id']}/fork",
                    headers=auth_headers)
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


# ── POST /<id>/point-order ────────────────────────────────────────────────────

@pytest.fixture(scope="function")
def route_of_three(client, auth_headers, itinerary):
    """Three points on one itinerary, in creation order, with their day 0 id."""
    day0_id = next(d["id"] for d in itinerary["days"] if d["dayNumber"] == 0)
    created = []
    for latitude in (44.0, 44.1, 44.2):
        response = client.post(
            f"{POINT_ENDPOINT}/create",
            headers=auth_headers,
            json={"dayId": day0_id, "type": "position",
                  "latitude": latitude, "longitude": 8.5},
        )
        assert response.status_code == 201
        created.append(response.json)
    return {"itinerary_id": itinerary["id"], "points": created}


def _chain_ids(client, auth_headers, points):
    """Walk the persisted next_id chain from its head and return the id order."""
    by_id = {}
    for point in points:
        fetched = client.get(f"{POINT_ENDPOINT}/{point['id']}", headers=auth_headers)
        assert fetched.status_code == 200
        by_id[point["id"]] = fetched.json
    referenced = {p["nextId"] for p in by_id.values() if p["nextId"]}
    heads = [pid for pid in by_id if pid not in referenced]
    assert len(heads) == 1, "the route is not a single chain"
    order, current = [], heads[0]
    while current:
        order.append(current)
        current = by_id[current]["nextId"]
    return order


def test_point_order_rewrites_the_chain(client, auth_headers, route_of_three):
    """pointOrder has been the frontend's canonical route order since M4b with no
    verb to send it back — points could only ever be appended to the tail."""
    [first, second, third] = route_of_three["points"]
    reversed_ids = [third["id"], second["id"], first["id"]]

    response = client.post(
        f"{ITINERARY_ENDPOINT}/{route_of_three['itinerary_id']}/point-order",
        headers=auth_headers,
        json={"order": reversed_ids},
    )
    assert response.status_code == 200
    assert response.json["order"] == reversed_ids
    assert _chain_ids(client, auth_headers, route_of_three["points"]) == reversed_ids


def test_point_order_bumps_route_version(client, auth_headers, route_of_three):
    before = client.get(
        f"{ITINERARY_ENDPOINT}/{route_of_three['itinerary_id']}", headers=auth_headers
    )
    assert before.status_code == 200
    before_version = before.json["routeVersion"]

    [first, second, third] = route_of_three["points"]
    response = client.post(
        f"{ITINERARY_ENDPOINT}/{route_of_three['itinerary_id']}/point-order",
        headers=auth_headers,
        json={"order": [third["id"], second["id"], first["id"]]},
    )
    assert response.status_code == 200

    after = client.get(
        f"{ITINERARY_ENDPOINT}/{route_of_three['itinerary_id']}", headers=auth_headers
    )
    assert after.json["routeVersion"] == before_version + 1


def test_point_order_leaves_the_route_alone_when_the_set_does_not_match(
    client, auth_headers, route_of_three
):
    """A stale order is a 409, not a partial apply: re-chaining it would orphan the
    points it left out, and an orphan's position is decided by a UUID tie-break."""
    [first, second, third] = route_of_three["points"]
    before = _chain_ids(client, auth_headers, route_of_three["points"])

    response = client.post(
        f"{ITINERARY_ENDPOINT}/{route_of_three['itinerary_id']}/point-order",
        headers=auth_headers,
        json={"order": [third["id"], first["id"]]},  # `second` dropped
    )
    assert response.status_code == 409
    assert _chain_ids(client, auth_headers, route_of_three["points"]) == before


def test_point_order_rejects_an_unknown_id(client, auth_headers, route_of_three):
    ids = [p["id"] for p in route_of_three["points"]]
    response = client.post(
        f"{ITINERARY_ENDPOINT}/{route_of_three['itinerary_id']}/point-order",
        headers=auth_headers,
        json={"order": ids[:2] + [_FAKE_UUID]},
    )
    assert response.status_code == 409


def test_point_order_rejects_a_duplicated_id(client, auth_headers, route_of_three):
    """Same length, same membership, but one point named twice — a chain built from
    it would loop."""
    [first, second, _third] = route_of_three["points"]
    response = client.post(
        f"{ITINERARY_ENDPOINT}/{route_of_three['itinerary_id']}/point-order",
        headers=auth_headers,
        json={"order": [first["id"], second["id"], first["id"]]},
    )
    assert response.status_code == 409


def test_point_order_requires_a_list(client, auth_headers, itinerary):
    response = client.post(
        f"{ITINERARY_ENDPOINT}/{itinerary['id']}/point-order",
        headers=auth_headers,
        json={"order": "not-a-list"},
    )
    assert response.status_code == 400


def test_point_order_for_other_users_itinerary_returns_403(
    client, auth_headers_2, route_of_three
):
    response = client.post(
        f"{ITINERARY_ENDPOINT}/{route_of_three['itinerary_id']}/point-order",
        headers=auth_headers_2,
        json={"order": [p["id"] for p in route_of_three["points"]]},
    )
    assert response.status_code == 403
