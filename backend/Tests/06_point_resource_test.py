import pytest
from Resources.point_resource import POINT_ENDPOINT
import json
from datetime import date, datetime


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
