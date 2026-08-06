"""HTTP-layer error branches for the trip resource — access guards, invitation
and membership validation, and not-found/conflict responses not covered by the
trip / member / invitation test files.
"""
import json

from Resources.trip_resource import TRIP_ENDPOINT

_FAKE_UUID = "00000000-0000-7000-8000-0000000000ee"


# ── access guards ─────────────────────────────────────────────────────────────

def test_get_all_trips_for_other_user_returns_403(client, auth_headers, id_2):
    resp = client.get(f"{TRIP_ENDPOINT}/{id_2}/all", headers=auth_headers)
    assert resp.status_code == 403


def test_get_own_invitations_returns_200(client, auth_headers, id):
    resp = client.get(f"{TRIP_ENDPOINT}/{id}/invitations", headers=auth_headers)
    assert resp.status_code == 200


def test_get_invitations_for_other_user_returns_403(client, auth_headers, id_2):
    resp = client.get(f"{TRIP_ENDPOINT}/{id_2}/invitations", headers=auth_headers)
    assert resp.status_code == 403


# ── state transition ──────────────────────────────────────────────────────────

def test_transition_state_missing_field_returns_400(client, auth_headers, trip_w_o_itinerary):
    trip_id = trip_w_o_itinerary["id"]
    resp = client.post(f"{TRIP_ENDPOINT}/{trip_id}/state", headers=auth_headers, json={})
    assert resp.status_code == 400


def test_transition_state_invalid_value_returns_400(client, auth_headers, trip_w_o_itinerary):
    trip_id = trip_w_o_itinerary["id"]
    resp = client.post(f"{TRIP_ENDPOINT}/{trip_id}/state", headers=auth_headers,
                       json={"state": "not-a-real-state"})
    assert resp.status_code == 400


# ── invitations ───────────────────────────────────────────────────────────────

def test_invite_missing_email_returns_400(client, auth_headers, trip_w_o_itinerary):
    trip_id = trip_w_o_itinerary["id"]
    resp = client.post(f"{TRIP_ENDPOINT}/{trip_id}/invite", headers=auth_headers, json={})
    assert resp.status_code == 400


def test_invite_already_invited_returns_409(client, trip_with_invitation):
    trip_id = trip_with_invitation["trip"]["id"]
    resp = client.post(f"{TRIP_ENDPOINT}/{trip_id}/invite",
                       headers=trip_with_invitation["leader_headers"],
                       json={"userId": trip_with_invitation["invitee_id"]})
    assert resp.status_code == 409


def test_handle_invitation_missing_accepted_returns_400(client, trip_with_invitation):
    trip_id = trip_with_invitation["trip"]["id"]
    resp = client.post(f"{TRIP_ENDPOINT}/{trip_id}/invitation",
                       headers=trip_with_invitation["invitee_headers"], json={})
    assert resp.status_code == 400


# ── membership ────────────────────────────────────────────────────────────────

def test_remove_unknown_member_returns_404(client, auth_headers, trip_w_o_itinerary):
    trip_id = trip_w_o_itinerary["id"]
    resp = client.delete(f"{TRIP_ENDPOINT}/{trip_id}/member/{_FAKE_UUID}", headers=auth_headers)
    assert resp.status_code == 404


def test_remove_leader_returns_409(client, auth_headers, trip_w_o_itinerary, id):
    trip_id = trip_w_o_itinerary["id"]
    resp = client.delete(f"{TRIP_ENDPOINT}/{trip_id}/member/{id}", headers=auth_headers)
    assert resp.status_code == 409

    # The rejected removal must be a true no-op — the leader is still on the trip.
    check = client.get(f"{TRIP_ENDPOINT}/{trip_id}/member/me", headers=auth_headers)
    assert check.status_code == 200
    assert json.loads(check.data)["role"] == "leader"


def test_get_my_membership_when_not_member_returns_404(client, auth_headers_2, trip_w_o_itinerary):
    """user_2 is not on user_1's trip."""
    trip_id = trip_w_o_itinerary["id"]
    resp = client.get(f"{TRIP_ENDPOINT}/{trip_id}/member/me", headers=auth_headers_2)
    assert resp.status_code == 404


def test_update_my_float_plan_body_not_dict_returns_400(client, trip_with_user2_as_crew):
    trip_id = trip_with_user2_as_crew["trip"]["id"]
    resp = client.patch(f"{TRIP_ENDPOINT}/{trip_id}/member/me",
                        headers=trip_with_user2_as_crew["crew_headers"], json=[1, 2])
    assert resp.status_code == 400
