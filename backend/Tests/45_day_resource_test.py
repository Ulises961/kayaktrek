"""HTTP-layer branches for the day resource — read-by-itinerary / read-by-key,
validation errors, assign-points guards, and not-found responses not covered
by 02_day_resource_test.py.
"""
from Resources.day_resource import DAY_ENDPOINT
from Resources.point_resource import POINT_ENDPOINT

_FAKE_UUID = "00000000-0000-7000-8000-0000000000ff"


def _a_day(itinerary):
    """Pick a real (non-staging) day id from the itinerary fixture."""
    return next(d for d in itinerary["days"] if d["dayNumber"] >= 1)


# ── GET /api/day/itinerary/<itinerary_id> ────────────────────────────────────

def test_read_days_by_itinerary_returns_200(client, auth_headers, itinerary):
    resp = client.get(f"{DAY_ENDPOINT}/itinerary/{itinerary['id']}", headers=auth_headers)
    assert resp.status_code == 200
    assert isinstance(resp.json, list)
    # This endpoint excludes day 0 (staging) — assert the actual numbered days
    # come back, not just any list.
    expected_ids = {d["id"] for d in itinerary["days"] if d["dayNumber"] != 0}
    assert {d["id"] for d in resp.json} == expected_ids


# ── GET /api/day/<id> ────────────────────────────────────────────────────────

def test_read_day_by_id_returns_200(client, auth_headers, itinerary):
    day = _a_day(itinerary)
    resp = client.get(f"{DAY_ENDPOINT}/{day['id']}", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json["id"] == day["id"]


# ── POST /api/day/by-key ─────────────────────────────────────────────────────

def test_read_day_by_key_returns_200(client, auth_headers, itinerary):
    day = _a_day(itinerary)
    resp = client.post(f"{DAY_ENDPOINT}/by-key", headers=auth_headers, json={
        "itineraryId": itinerary["id"], "dayNumber": day["dayNumber"], "date": day["date"],
    })
    assert resp.status_code == 200


def test_read_day_by_key_missing_field_returns_400(client, auth_headers, itinerary):
    # itineraryId present (so require_owner passes) but dayNumber omitted.
    resp = client.post(f"{DAY_ENDPOINT}/by-key", headers=auth_headers, json={
        "itineraryId": itinerary["id"], "date": "2020-12-31",
    })
    assert resp.status_code == 400


# ── POST /api/day/create ─────────────────────────────────────────────────────

def test_create_day_returns_201(client, auth_headers, itinerary):
    resp = client.post(f"{DAY_ENDPOINT}/create", headers=auth_headers, json={
        "itineraryId": itinerary["id"], "dayNumber": 5, "date": "2025-06-15",
    })
    assert resp.status_code == 201
    assert resp.json["dayNumber"] == 5


def test_create_day_validation_error_returns_400(client, auth_headers, itinerary):
    # day_number out of the 1..365 range trips the schema validator.
    resp = client.post(f"{DAY_ENDPOINT}/create", headers=auth_headers, json={
        "itineraryId": itinerary["id"], "dayNumber": 999,
    })
    assert resp.status_code == 400


# ── PATCH /api/day/<id> ──────────────────────────────────────────────────────

def test_update_day_returns_200(client, auth_headers, itinerary):
    day = _a_day(itinerary)
    resp = client.patch(f"{DAY_ENDPOINT}/{day['id']}", headers=auth_headers,
                        json={"dayNumber": 7})
    assert resp.status_code == 200
    assert resp.json["dayNumber"] == 7


def test_update_day_validation_error_returns_400(client, auth_headers, itinerary):
    day = _a_day(itinerary)
    resp = client.patch(f"{DAY_ENDPOINT}/{day['id']}", headers=auth_headers,
                        json={"dayNumber": 999})
    assert resp.status_code == 400


# ── POST /api/day/<id>/assign ────────────────────────────────────────────────

def test_assign_points_missing_fields_returns_400(client, auth_headers, itinerary):
    day = _a_day(itinerary)
    resp = client.post(f"{DAY_ENDPOINT}/{day['id']}/assign", headers=auth_headers, json={})
    assert resp.status_code == 400


def test_assign_points_returns_200(client, auth_headers, itinerary):
    day = _a_day(itinerary)
    other_day = next(d for d in itinerary["days"] if d["id"] != day["id"] and d["dayNumber"] != 0)
    point = client.post(f"{POINT_ENDPOINT}/create", headers=auth_headers, json={
        "dayId": other_day["id"], "type": "position", "latitude": 44.0, "longitude": 8.5,
    }).json
    resp = client.post(f"{DAY_ENDPOINT}/{day['id']}/assign", headers=auth_headers,
                       json={"startPointId": point["id"], "endPointId": point["id"]})
    assert resp.status_code == 200
    # The consequence beyond the 200: the point actually moved to this day.
    moved = client.get(f"{POINT_ENDPOINT}/{point['id']}", headers=auth_headers)
    assert moved.json["dayId"] == day["id"]


def test_assign_points_unreachable_end_returns_400(client, auth_headers, itinerary):
    day = _a_day(itinerary)
    p1 = client.post(f"{POINT_ENDPOINT}/create", headers=auth_headers, json={
        "dayId": day["id"], "type": "position", "latitude": 44.0, "longitude": 8.5}).json
    p2 = client.post(f"{POINT_ENDPOINT}/create", headers=auth_headers, json={
        "dayId": day["id"], "type": "position", "latitude": 44.1, "longitude": 8.6}).json
    # p2 is not downstream of p1's chain head → not reachable.
    resp = client.post(f"{DAY_ENDPOINT}/{day['id']}/assign", headers=auth_headers,
                       json={"startPointId": p2["id"], "endPointId": p1["id"]})
    assert resp.status_code == 400


# ── DELETE /api/day/<id> ─────────────────────────────────────────────────────

def test_delete_day_returns_200(client, auth_headers, itinerary):
    day = _a_day(itinerary)
    resp = client.delete(f"{DAY_ENDPOINT}/{day['id']}", headers=auth_headers)
    assert resp.status_code == 200
    # The delete must actually take effect, not just return 200.
    assert client.get(f"{DAY_ENDPOINT}/{day['id']}", headers=auth_headers).status_code == 404
