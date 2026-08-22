import pytest
from Resources.itinerary_resource import ITINERARY_ENDPOINT
from Resources.point_resource import POINT_ENDPOINT
import json
from datetime import date, datetime


@pytest.fixture(scope="function")
def second_itinerary(client, auth_headers):
    """A second, unrelated route owned by the same user — the other side of the
    "afterPointId must belong to this itinerary" check."""
    response = client.post(
        f"{ITINERARY_ENDPOINT}/create",
        headers=auth_headers,
        json={"name": "Another Route"},
    )
    assert response.status_code == 201
    itinerary = response.json

    yield itinerary

    try:
        client.delete(f"{ITINERARY_ENDPOINT}/{itinerary['id']}", headers=auth_headers)
    except Exception:
        pass


@pytest.fixture(scope="function")
def points(client, auth_headers, itinerary):
    point_1 = {"dayId": itinerary["days"][0]["id"], "type": "position"}
    point_2 = {"dayId": itinerary["days"][0]["id"], "type": "position"}
    point_3 = {"dayId": itinerary["days"][0]["id"], "type": "position"}
    point_4 = {"dayId": itinerary["days"][0]["id"], "type": "position"}

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


def test_delete_point_not_found_returns_404(client, auth_headers):
    """Regression: the resource caught NoResultFound and called
    abort(HTTPStatus.NOT_FOUND, message=...) — werkzeug's HTTPException has no
    `message` kwarg, so this raised an unhandled TypeError (500) instead of a 404.
    """
    resp = client.delete(f"{POINT_ENDPOINT}/00000000-0000-7000-8000-000000000abc", headers=auth_headers)
    assert resp.status_code == 404


def test_get_point_not_found_returns_404(client, auth_headers):
    resp = client.get(f"{POINT_ENDPOINT}/00000000-0000-7000-8000-000000000abc", headers=auth_headers)
    assert resp.status_code == 404


def test_update_point_not_found_returns_404(client, auth_headers):
    resp = client.patch(
        f"{POINT_ENDPOINT}/00000000-0000-7000-8000-000000000abc",
        headers=auth_headers,
        json={"type": "stop"},
    )
    assert resp.status_code == 404


def test_create_point_missing_type_returns_400(client, auth_headers, itinerary):
    """`type` is required on PointSchema — omitting it must not silently default."""
    day_id = itinerary["days"][0]["id"]
    resp = client.post(
        f"{POINT_ENDPOINT}/create", headers=auth_headers, json={"dayId": day_id}
    )
    assert resp.status_code == 400


def test_delete_point_heals_the_chain(client, auth_headers, points):
    """Deleting a mid-chain point must relink its predecessor to its successor.

    point.next_id is ON DELETE SET NULL at the DB level, so if this healing ever
    regresses the database will not complain — it will quietly blank the
    predecessor's next_id and truncate the route from that point on. Nothing else
    guards that, so assert the relink itself rather than just the 200.
    """
    [first, middle, third, _] = points

    response = client.delete(f"{POINT_ENDPOINT}/{middle["id"]}", headers=auth_headers)
    assert response.status_code == 200

    predecessor = client.get(f"{POINT_ENDPOINT}/{first["id"]}", headers=auth_headers)
    assert predecessor.status_code == 200
    assert json.loads(predecessor.data)["nextId"] == third["id"]


# Points of interest are no longer route points — the POI range query moved to the
# Place entity (M4e §1). Its proximity tests live in 50_m4e_place_resource_test.py.


# ── afterPointId: splice into the chain instead of appending (M20 §4) ─────────

def test_create_point_after_splices_into_the_chain(client, auth_headers, points):
    """A point dropped on a leg belongs between the two points it was dropped
    between. Without afterPointId every create appended to the itinerary-wide tail,
    so inserting mid-route was not expressible at all."""
    [first, second, third, _] = points

    response = client.post(
        f"{POINT_ENDPOINT}/create",
        headers=auth_headers,
        json={
            "dayId": first["dayId"],
            "type": "position",
            "latitude": 44.05,
            "longitude": 8.55,
            "afterPointId": first["id"],
        },
    )
    assert response.status_code == 201
    inserted = response.json

    # The new point points at what the predecessor used to, and the predecessor
    # points at the new point — a splice, not a truncation.
    assert inserted["nextId"] == second["id"]
    predecessor = client.get(f"{POINT_ENDPOINT}/{first['id']}", headers=auth_headers)
    assert predecessor.json["nextId"] == inserted["id"]
    # The rest of the route is untouched.
    unchanged = client.get(f"{POINT_ENDPOINT}/{second['id']}", headers=auth_headers)
    assert unchanged.json["nextId"] == third["id"]

    client.delete(f"{POINT_ENDPOINT}/{inserted['id']}", headers=auth_headers)


def test_create_point_after_the_tail_still_ends_the_chain(client, auth_headers, points):
    """Splicing after the last point leaves the new point as the tail, not a point
    with a dangling next_id."""
    last = points[-1]

    response = client.post(
        f"{POINT_ENDPOINT}/create",
        headers=auth_headers,
        json={"dayId": last["dayId"], "type": "position", "afterPointId": last["id"]},
    )
    assert response.status_code == 201
    assert response.json["nextId"] is None

    predecessor = client.get(f"{POINT_ENDPOINT}/{last['id']}", headers=auth_headers)
    assert predecessor.json["nextId"] == response.json["id"]

    client.delete(f"{POINT_ENDPOINT}/{response.json['id']}", headers=auth_headers)


def test_create_point_after_unknown_point_returns_400(client, auth_headers, itinerary):
    response = client.post(
        f"{POINT_ENDPOINT}/create",
        headers=auth_headers,
        json={
            "dayId": itinerary["days"][0]["id"],
            "type": "position",
            "afterPointId": "00000000-0000-7000-8000-000000000099",
        },
    )
    assert response.status_code == 400


def test_create_point_after_a_point_in_another_itinerary_returns_400(
    client, auth_headers, points, second_itinerary
):
    """Splicing across routes would braid two chains together and leave both
    unwalkable, so the predecessor has to belong to this itinerary."""
    foreign = client.post(
        f"{POINT_ENDPOINT}/create",
        headers=auth_headers,
        json={"dayId": second_itinerary["days"][0]["id"], "type": "position"},
    )
    assert foreign.status_code == 201

    response = client.post(
        f"{POINT_ENDPOINT}/create",
        headers=auth_headers,
        json={
            "dayId": points[0]["dayId"],
            "type": "position",
            "afterPointId": foreign.json["id"],
        },
    )
    assert response.status_code == 400

    client.delete(f"{POINT_ENDPOINT}/{foreign.json['id']}", headers=auth_headers)
