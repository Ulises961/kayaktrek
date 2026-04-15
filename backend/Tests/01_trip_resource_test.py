from Resources.trip_resource import TRIP_ENDPOINT
import json


def _create_trip(client, auth_headers, **kwargs):
    """Helper — create a minimal trip and return the parsed response body."""
    trip = {"inventory": {}, "itinerary": {"isPublic": True, "totalMiles": 0, "days": []}, **kwargs}
    response = client.post(f"{TRIP_ENDPOINT}/create", json=trip, headers=auth_headers)
    assert response.status_code == 201
    return json.loads(response.data)


def test_insert_trip_w_itinerary_and_inventory(client, auth_headers):
    itinerary = {"isPublic": True, "totalMiles": 25, "days": []}
    inventory = {"items": [{"category": "travel", "name": "compass"}, {"category": "firstAid", "name": "scissors"}]}
    response = client.post(f"{TRIP_ENDPOINT}/create", json={"inventory": inventory, "itinerary": itinerary}, headers=auth_headers)
    assert response.status_code == 201


def test_insert_trip_w_itinerary_and_empty_inventory(client, auth_headers):
    itinerary = {"isPublic": True, "totalMiles": 25, "days": []}
    response = client.post(f"{TRIP_ENDPOINT}/create", json={"inventory": {}, "itinerary": itinerary}, headers=auth_headers)
    assert response.status_code == 201


def test_insert_trip_w_o_itinerary(client, auth_headers):
    inventory = {"items": [{"category": "travel", "name": "compass"}]}
    response = client.post(f"{TRIP_ENDPOINT}/create", json={"inventory": inventory}, headers=auth_headers)
    assert response.status_code == 201


def test_new_trip_defaults_to_draft_state(client, auth_headers):
    data = _create_trip(client, auth_headers)
    assert data["state"] == "draft"


def test_get_all_trips(client, auth_headers, id):
    response = client.get(f"{TRIP_ENDPOINT}/{id}/all", headers=auth_headers)
    assert response.status_code == 200
    assert isinstance(json.loads(response.data), list)


def test_get_trip_by_id(client, auth_headers):
    data = _create_trip(client, auth_headers)
    response = client.get(f"{TRIP_ENDPOINT}/{data['id']}", headers=auth_headers)
    assert response.status_code == 200

# --- State machine ---

def test_transition_draft_to_planning(client, auth_headers):
    data = _create_trip(client, auth_headers)
    response = client.post(f"{TRIP_ENDPOINT}/{data['id']}/state", json={"state": "planning"}, headers=auth_headers)
    assert response.status_code == 200
    assert json.loads(response.data)["state"] == "planning"


def test_transition_planning_to_happening(client, auth_headers):
    data = _create_trip(client, auth_headers)
    client.post(f"{TRIP_ENDPOINT}/{data['id']}/state", json={"state": "planning"}, headers=auth_headers)
    response = client.post(f"{TRIP_ENDPOINT}/{data['id']}/state", json={"state": "happening"}, headers=auth_headers)
    assert response.status_code == 200
    assert json.loads(response.data)["state"] == "happening"


def test_transition_happening_to_past(client, auth_headers):
    data = _create_trip(client, auth_headers)
    client.post(f"{TRIP_ENDPOINT}/{data['id']}/state", json={"state": "planning"}, headers=auth_headers)
    client.post(f"{TRIP_ENDPOINT}/{data['id']}/state", json={"state": "happening"}, headers=auth_headers)
    response = client.post(f"{TRIP_ENDPOINT}/{data['id']}/state", json={"state": "past"}, headers=auth_headers)
    assert response.status_code == 200
    assert json.loads(response.data)["state"] == "past"


def test_transition_skipping_state_is_rejected(client, auth_headers):
    data = _create_trip(client, auth_headers)
    response = client.post(f"{TRIP_ENDPOINT}/{data['id']}/state", json={"state": "happening"}, headers=auth_headers)
    assert response.status_code == 400


def test_transition_backward_is_rejected(client, auth_headers):
    data = _create_trip(client, auth_headers)
    client.post(f"{TRIP_ENDPOINT}/{data['id']}/state", json={"state": "planning"}, headers=auth_headers)
    response = client.post(f"{TRIP_ENDPOINT}/{data['id']}/state", json={"state": "draft"}, headers=auth_headers)
    assert response.status_code == 400


def test_transition_invalid_state_value_is_rejected(client, auth_headers):
    data = _create_trip(client, auth_headers)
    response = client.post(f"{TRIP_ENDPOINT}/{data['id']}/state", json={"state": "flying"}, headers=auth_headers)
    assert response.status_code == 400


def test_transition_missing_state_field_is_rejected(client, auth_headers):
    data = _create_trip(client, auth_headers)
    response = client.post(f"{TRIP_ENDPOINT}/{data['id']}/state", json={}, headers=auth_headers)
    assert response.status_code == 400


# --- Member roles ---

def test_creator_is_stored_as_leader(client, auth_headers):
    data = _create_trip(client, auth_headers)
    assert len(data["travellers"]) == 1
    assert data["travellers"][0]["role"] == "leader"


def test_non_member_cannot_transition_state(client, auth_headers, outsider_headers):
    """A user who is not on the trip gets 403 from require_owner."""
    data = _create_trip(client, auth_headers)
    response = client.post(
        f"{TRIP_ENDPOINT}/{data['id']}/state",
        json={"state": "planning"},
        headers=outsider_headers,
    )
    assert response.status_code == 403


def test_leader_can_transition_state(client, auth_headers):
    """Trip creator (leader) can advance the state."""
    data = _create_trip(client, auth_headers)
    response = client.post(
        f"{TRIP_ENDPOINT}/{data['id']}/state",
        json={"state": "planning"},
        headers=auth_headers,
    )
    assert response.status_code == 200
    assert json.loads(response.data)["state"] == "planning"


def test_crew_cannot_transition_state(client, trip_with_crew):
    """A crew member (on the trip but not leader) is rejected by require_leader."""
    trip_id = trip_with_crew["trip"]["id"]
    response = client.post(
        f"{TRIP_ENDPOINT}/{trip_id}/state",
        json={"state": "planning"},
        headers=trip_with_crew["crew_headers"],
    )
    assert response.status_code == 403
