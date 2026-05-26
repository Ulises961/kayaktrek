import pytest
from Resources.point_resource import POINT_ENDPOINT
import json
from datetime import date, datetime


@pytest.fixture(scope="function")
def points(client, auth_headers, itinerary):
    point_1 = {"dayId": itinerary["days"][0]["id"], "type": "interest"}
    point_2 = {"dayId": itinerary["days"][0]["id"], "type": "position"}
    point_3 = {"dayId": itinerary["days"][0]["id"], "type": "interest"}
    point_4 = {"dayId": itinerary["days"][0]["id"], "type": "interest"}

    response_1 = client.post(
        f"{POINT_ENDPOINT}/create", headers=auth_headers, json=point_1
    )
    response_2 = client.post(
        f"{POINT_ENDPOINT}/create", headers=auth_headers, json=point_2
    )
    response_3 = client.post(
        f"{POINT_ENDPOINT}/create", headers=auth_headers, json=point_3
    )
    response_4 = client.post(
        f"{POINT_ENDPOINT}/create", headers=auth_headers, json=point_4
    )

    assert response_1.status_code == 201
    assert response_2.status_code == 201
    assert response_3.status_code == 201
    assert response_4.status_code == 201

    responses = [response_1, response_2, response_3, response_4]
    points = [response.json for response in responses]
    
    yield points
    
    # Clean up
    try:
        response_1 = client.delete(
            f"{POINT_ENDPOINT}/{point_1["id"]}", headers=auth_headers, json=point_1
        )
        response_2 = client.delete(
            f"{POINT_ENDPOINT}/{point_2["id"]}", headers=auth_headers, json=point_2
        )
        response_3 = client.delete(
            f"{POINT_ENDPOINT}/{point_3["id"]}", headers=auth_headers, json=point_3
        )
        response_4 = client.delete(
            f"{POINT_ENDPOINT}/{point_4["id"]}", headers=auth_headers, json=point_4
        )
    except:
        pass


def test_update_point(client, points, auth_headers):
    point = points[0]
    point_id = point["id"]
    point = {**point, "type": "stop"}

    response = client.patch(
        f"{POINT_ENDPOINT}/{point_id}", headers=auth_headers, json=point
    )
    assert response.status_code == 200
    assert json.loads(response.data)["type"] == "stop"


def test_link_points(client, points, auth_headers):
    [point, point_2, _, _] = points

    # Send only the fields we want to change — not the full GET response —
    # so dump-only fields like nextId don't accidentally override the link we're setting.
    response = client.patch(
        f"{POINT_ENDPOINT}/{point['id']}",
        headers=auth_headers,
        json={"next": point_2},
    )

    data = json.loads(response.data)
    assert response.status_code == 200
    assert data["next"]["id"] == point_2["id"]
    assert data["nextId"] == point_2["id"]


def test_delete_point(client, auth_headers, points):
    point = points[3]
    response = client.delete(f"{POINT_ENDPOINT}/{point["id"]}", headers=auth_headers)
    assert response.status_code == 200
    response = client.get(f"{POINT_ENDPOINT}/{point["id"]}", headers=auth_headers)
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# POI range query tests
# Coordinates: Tyrrhenian Sea, Sardinia coast (realistic kayaking area)
#   near:    40.9000°N 9.5000°E  (~0 km from query centre)
#   close:   40.9050°N 9.5060°E  (~0.8 km from query centre)
#   far:     41.0500°N 9.6500°E  (~20 km from query centre)
#   non-poi: 40.9010°N 9.5010°E  (STOP type — must not appear)
# ---------------------------------------------------------------------------

@pytest.fixture(scope="function")
def geo_points(client, auth_headers, itinerary):
    """Create geo-tagged points for POI range tests."""
    day_id = itinerary["days"][0]["id"]
    payloads = [
        {"dayId": day_id, "type": "interest", "latitude": 40.9000, "longitude": 9.5000},   # near
        {"dayId": day_id, "type": "interest", "latitude": 40.9050, "longitude": 9.5060},   # close
        {"dayId": day_id, "type": "interest", "latitude": 41.0500, "longitude": 9.6500},   # far
        {"dayId": day_id, "type": "stop",     "latitude": 40.9010, "longitude": 9.5010},   # non-poi
    ]
    created = []
    for p in payloads:
        r = client.post(f"{POINT_ENDPOINT}/create", headers=auth_headers, json=p)
        assert r.status_code == 201
        created.append(r.json)

    yield created

    for pt in created:
        try:
            client.delete(f"{POINT_ENDPOINT}/{pt['id']}", headers=auth_headers)
        except Exception:
            pass


def test_pois_within_range_returns_only_interest(client, auth_headers, geo_points):
    """Only INTEREST-type points should be returned."""
    response = client.get(
        f"{POINT_ENDPOINT}/pois?range=5&long=9.5000&lat=40.9000",
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json
    types = {p["type"] for p in data}
    assert types == {"interest"} or types == set()


def test_pois_within_range_excludes_distant_points(client, auth_headers, geo_points):
    """Points beyond the radius must not appear."""
    response = client.get(
        f"{POINT_ENDPOINT}/pois?range=5&long=9.5000&lat=40.9000",
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json
    # The "far" point is ~20 km away — must not be in results
    far_id = geo_points[2]["id"]
    returned_ids = {p["id"] for p in data}
    assert far_id not in returned_ids


def test_pois_within_range_includes_nearby_points(client, auth_headers, geo_points):
    """Points inside the radius must appear with distance_km attached."""
    response = client.get(
        f"{POINT_ENDPOINT}/pois?range=5&long=9.5000&lat=40.9000",
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json
    near_id = geo_points[0]["id"]
    close_id = geo_points[1]["id"]
    returned_ids = {p["id"] for p in data}
    assert near_id in returned_ids
    assert close_id in returned_ids
    for p in data:
        assert "distanceKm" in p
        assert p["distanceKm"] >= 0


def test_pois_ordered_by_distance(client, auth_headers, geo_points):
    """Results must be sorted nearest-first."""
    response = client.get(
        f"{POINT_ENDPOINT}/pois?range=5&long=9.5000&lat=40.9000",
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = response.json
    distances = [p["distanceKm"] for p in data]
    assert distances == sorted(distances)


def test_pois_empty_when_nothing_in_range(client, auth_headers, geo_points):
    """Query in the middle of the ocean returns an empty list."""
    response = client.get(
        f"{POINT_ENDPOINT}/pois?range=1&long=0.0&lat=0.0",
        headers=auth_headers,
    )
    assert response.status_code == 200
    assert response.json == []
