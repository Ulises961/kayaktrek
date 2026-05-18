from uuid import UUID
from Resources.trip_resource import TRIP_ENDPOINT
from Models.invitation import Invitation
from Models.user import User
from Api.database import db as _db
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


def test_new_trip_defaults_to_building_state(client, auth_headers):
    data = _create_trip(client, auth_headers)
    assert data["state"] == "building"


def test_get_all_trips(client, auth_headers, id):
    response = client.get(f"{TRIP_ENDPOINT}/{id}/all", headers=auth_headers)
    assert response.status_code == 200
    data = json.loads(response.data)
    assert "items" in data and "total" in data


def test_get_trip_by_id(client, auth_headers):
    data = _create_trip(client, auth_headers)
    response = client.get(f"{TRIP_ENDPOINT}/{data['id']}", headers=auth_headers)
    assert response.status_code == 200

# --- State machine ---

def test_transition_building_to_happening(client, auth_headers):
    data = _create_trip(client, auth_headers)
    response = client.post(f"{TRIP_ENDPOINT}/{data['id']}/state", json={"state": "happening"}, headers=auth_headers)
    assert response.status_code == 200
    assert json.loads(response.data)["state"] == "happening"


def test_transition_happening_to_past(client, auth_headers):
    data = _create_trip(client, auth_headers)
    client.post(f"{TRIP_ENDPOINT}/{data['id']}/state", json={"state": "happening"}, headers=auth_headers)
    response = client.post(f"{TRIP_ENDPOINT}/{data['id']}/state", json={"state": "past"}, headers=auth_headers)
    assert response.status_code == 200
    assert json.loads(response.data)["state"] == "past"


def test_transition_skipping_state_is_rejected(client, auth_headers):
    data = _create_trip(client, auth_headers)
    response = client.post(f"{TRIP_ENDPOINT}/{data['id']}/state", json={"state": "past"}, headers=auth_headers)
    assert response.status_code == 400


def test_transition_backward_is_rejected(client, auth_headers):
    data = _create_trip(client, auth_headers)
    client.post(f"{TRIP_ENDPOINT}/{data['id']}/state", json={"state": "happening"}, headers=auth_headers)
    response = client.post(f"{TRIP_ENDPOINT}/{data['id']}/state", json={"state": "building"}, headers=auth_headers)
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
        json={"state": "happening"},
        headers=outsider_headers,
    )
    assert response.status_code == 403


def test_leader_can_transition_state(client, auth_headers):
    """Trip creator (leader) can advance the state."""
    data = _create_trip(client, auth_headers)
    response = client.post(
        f"{TRIP_ENDPOINT}/{data['id']}/state",
        json={"state": "happening"},
        headers=auth_headers,
    )
    assert response.status_code == 200
    assert json.loads(response.data)["state"] == "happening"


def test_crew_cannot_transition_state(client, trip_with_crew):
    """A crew member (on the trip but not leader) is rejected by require_leader."""
    trip_id = trip_with_crew["trip"]["id"]
    response = client.post(
        f"{TRIP_ENDPOINT}/{trip_id}/state",
        json={"state": "happening"},
        headers=trip_with_crew["crew_headers"],
    )
    assert response.status_code == 403


# --- PATCH ---

def test_patch_trip_updates_destination(client, auth_headers):
    data = _create_trip(client, auth_headers)
    response = client.patch(
        f"{TRIP_ENDPOINT}/{data['id']}",
        json={"destination": "Lofoten"},
        headers=auth_headers,
    )
    assert response.status_code == 200
    assert json.loads(response.data)["destination"] == "Lofoten"


def test_patch_trip_updates_dates(client, auth_headers):
    data = _create_trip(client, auth_headers)
    response = client.patch(
        f"{TRIP_ENDPOINT}/{data['id']}",
        json={"dateFrom": "2027-06-01", "dateTo": "2027-06-14"},
        headers=auth_headers,
    )
    assert response.status_code == 200
    body = json.loads(response.data)
    assert body["dateFrom"] == "2027-06-01"
    assert body["dateTo"] == "2027-06-14"


def test_patch_trip_date_to_before_date_from_rejected(client, auth_headers):
    data = _create_trip(client, auth_headers)
    response = client.patch(
        f"{TRIP_ENDPOINT}/{data['id']}",
        json={"dateFrom": "2027-06-14", "dateTo": "2027-06-01"},
        headers=auth_headers,
    )
    assert response.status_code == 400


def test_patch_trip_ignores_unknown_fields(client, auth_headers):
    data = _create_trip(client, auth_headers)
    response = client.patch(
        f"{TRIP_ENDPOINT}/{data['id']}",
        json={"destination": "Iceland", "state": "past"},
        headers=auth_headers,
    )
    assert response.status_code == 200
    body = json.loads(response.data)
    assert body["destination"] == "Iceland"
    assert body["state"] == "building"


def test_non_member_cannot_patch_trip(client, auth_headers, outsider_headers):
    data = _create_trip(client, auth_headers)
    response = client.patch(
        f"{TRIP_ENDPOINT}/{data['id']}",
        json={"destination": "Norway"},
        headers=outsider_headers,
    )
    assert response.status_code == 403


# --- DELETE ---

def test_delete_trip_for_everyone_removes_trip(client, auth_headers):
    data = _create_trip(client, auth_headers)
    trip_id = data["id"]
    response = client.delete(f"{TRIP_ENDPOINT}/{trip_id}?for_everyone=true", headers=auth_headers)
    assert response.status_code == 200
    assert client.get(f"{TRIP_ENDPOINT}/{trip_id}", headers=auth_headers).status_code == 404


def test_delete_trip_for_everyone_cascades_pending_invitations(client, trip_with_invitation):
    trip_id = trip_with_invitation["trip"]["id"]

    response = client.delete(f"{TRIP_ENDPOINT}/{trip_id}?for_everyone=true", headers=trip_with_invitation["leader_headers"])
    assert response.status_code == 200

    remaining = _db.session.query(Invitation).filter_by(trip_id=UUID(trip_id)).all()
    assert remaining == []


def test_delete_trip_for_self_as_sole_member_removes_trip(client, auth_headers):
    data = _create_trip(client, auth_headers)
    trip_id = data["id"]
    response = client.delete(f"{TRIP_ENDPOINT}/{trip_id}", headers=auth_headers)
    assert response.status_code == 200
    assert client.get(f"{TRIP_ENDPOINT}/{trip_id}", headers=auth_headers).status_code == 404


def test_non_member_cannot_delete_trip(client, auth_headers, outsider_headers):
    data = _create_trip(client, auth_headers)
    response = client.delete(f"{TRIP_ENDPOINT}/{data['id']}", headers=outsider_headers)
    assert response.status_code == 403


# --- Invitation flow ---

def test_invite_user_returns_201(client, auth_headers, user_2):
    data = _create_trip(client, auth_headers)
    response = client.post(
        f"{TRIP_ENDPOINT}/{data['id']}/invite",
        json={"email": user_2.mail},
        headers=auth_headers,
    )
    assert response.status_code == 201


def test_invited_user_appears_in_pending_travellers(client, trip_with_invitation):
    trip_id = trip_with_invitation["trip"]["id"]
    response = client.get(f"{TRIP_ENDPOINT}/{trip_id}", headers=trip_with_invitation["leader_headers"])
    body = json.loads(response.data)
    pending_ids = [u["id"] for u in body["pendingTravellers"]]
    assert trip_with_invitation["invitee_id"] in pending_ids


def test_invite_already_member_returns_409(client, trip_with_user2_as_crew):
    trip_id = trip_with_user2_as_crew["trip"]["id"]
    response = client.post(
        f"{TRIP_ENDPOINT}/{trip_id}/invite",
        json={"email": trip_with_user2_as_crew["crew_email"]},
        headers=trip_with_user2_as_crew["leader_headers"],
    )
    assert response.status_code == 409


def test_duplicate_pending_invitation_returns_409(client, trip_with_invitation):
    trip_id = trip_with_invitation["trip"]["id"]
    response = client.post(
        f"{TRIP_ENDPOINT}/{trip_id}/invite",
        json={"email": trip_with_invitation["invitee_email"]},
        headers=trip_with_invitation["leader_headers"],
    )
    assert response.status_code == 409


def test_non_leader_cannot_invite(client, trip_with_invitation):
    trip_id = trip_with_invitation["trip"]["id"]
    response = client.post(
        f"{TRIP_ENDPOINT}/{trip_id}/invite",
        json={"email": trip_with_invitation["invitee_email"]},
        headers=trip_with_invitation["invitee_headers"],
    )
    assert response.status_code == 403


def test_invitee_accepts_becomes_crew(client, trip_with_invitation):
    trip_id = trip_with_invitation["trip"]["id"]
    response = client.post(
        f"{TRIP_ENDPOINT}/{trip_id}/invitation",
        json={"accepted": True},
        headers=trip_with_invitation["invitee_headers"],
    )
    assert response.status_code == 200

    body = json.loads(client.get(f"{TRIP_ENDPOINT}/{trip_id}", headers=trip_with_invitation["leader_headers"]).data)
    member_ids = [m["user"]["id"] for m in body["travellers"]]
    pending_ids = [u["id"] for u in body["pendingTravellers"]]
    assert trip_with_invitation["invitee_id"] in member_ids
    assert trip_with_invitation["invitee_id"] not in pending_ids


def test_invitee_declines_not_added_to_travellers(client, trip_with_invitation):
    trip_id = trip_with_invitation["trip"]["id"]
    response = client.post(
        f"{TRIP_ENDPOINT}/{trip_id}/invitation",
        json={"accepted": False},
        headers=trip_with_invitation["invitee_headers"],
    )
    assert response.status_code == 200

    body = json.loads(client.get(f"{TRIP_ENDPOINT}/{trip_id}", headers=trip_with_invitation["leader_headers"]).data)
    member_ids = [m["user"]["id"] for m in body["travellers"]]
    pending_ids = [u["id"] for u in body["pendingTravellers"]]
    assert trip_with_invitation["invitee_id"] not in member_ids
    assert trip_with_invitation["invitee_id"] not in pending_ids


def test_leader_cancels_invitation(client, trip_with_invitation):
    trip_id = trip_with_invitation["trip"]["id"]
    invitee_id = trip_with_invitation["invitee_id"]

    response = client.delete(
        f"{TRIP_ENDPOINT}/{trip_id}/invite/{invitee_id}",
        headers=trip_with_invitation["leader_headers"],
    )
    assert response.status_code == 200

    body = json.loads(client.get(f"{TRIP_ENDPOINT}/{trip_id}", headers=trip_with_invitation["leader_headers"]).data)
    assert invitee_id not in [u["id"] for u in body["pendingTravellers"]]


def test_accept_nonexistent_invitation_returns_404(client, auth_headers):
    data = _create_trip(client, auth_headers)
    response = client.post(
        f"{TRIP_ENDPOINT}/{data['id']}/invitation",
        json={"accepted": True},
        headers=auth_headers,
    )
    assert response.status_code == 404


# --- Member removal ---

def test_leader_removes_crew_member(client, trip_with_user2_as_crew):
    trip_id = trip_with_user2_as_crew["trip"]["id"]
    crew_id = trip_with_user2_as_crew["crew_id"]

    response = client.delete(
        f"{TRIP_ENDPOINT}/{trip_id}/member/{crew_id}",
        headers=trip_with_user2_as_crew["leader_headers"],
    )
    assert response.status_code == 200

    body = json.loads(client.get(f"{TRIP_ENDPOINT}/{trip_id}", headers=trip_with_user2_as_crew["leader_headers"]).data)
    assert crew_id not in [m["user"]["id"] for m in body["travellers"]]


def test_leader_cannot_remove_self(client, trip_with_user2_as_crew, id):
    trip_id = trip_with_user2_as_crew["trip"]["id"]
    response = client.delete(
        f"{TRIP_ENDPOINT}/{trip_id}/member/{id}",
        headers=trip_with_user2_as_crew["leader_headers"],
    )
    assert response.status_code == 409


def test_non_leader_cannot_remove_member(client, trip_with_user2_as_crew, id):
    trip_id = trip_with_user2_as_crew["trip"]["id"]
    response = client.delete(
        f"{TRIP_ENDPOINT}/{trip_id}/member/{id}",
        headers=trip_with_user2_as_crew["crew_headers"],
    )
    assert response.status_code == 403


def test_remove_nonmember_returns_404(client, auth_headers, outsider_headers):
    data = _create_trip(client, auth_headers)
    outsider = User.query.filter_by(mail="outsider.tmp@example.com").first()
    outsider_id = str(outsider.id) if outsider else "00000000-0000-0000-0000-000000000000"
    response = client.delete(
        f"{TRIP_ENDPOINT}/{data['id']}/member/{outsider_id}",
        headers=auth_headers,
    )
    assert response.status_code == 404
