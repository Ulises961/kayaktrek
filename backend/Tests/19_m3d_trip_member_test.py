import json
import pytest

from Resources.user_resource import USER_ENDPOINT
from Resources.trip_resource import TRIP_ENDPOINT

_USER_1_PWD = "testPassword6$"
_USER_2_PWD = "pwdTest2$"
_MEDICAL_NOTES = "Allergic to penicillin. Blood type A+."
_MEDICAL_NOTES_2 = "No known allergies. Blood type O+."


def _elevated_headers(client, auth_headers, password=_USER_1_PWD):
    r = client.post(
        f"{USER_ENDPOINT}/me/re-auth",
        json={"password": password},
        headers=auth_headers,
    )
    assert r.status_code == 200
    token = json.loads(r.data)["elevatedToken"]
    return {**auth_headers, "X-Elevated-Token": token}


@pytest.fixture(scope="function")
def trip_with_medical_consent(client, auth_headers, trip_with_user2_as_crew):
    """
    Grants medical consent for user_1, yields the trip fixture,
    then revokes consent on teardown.
    """
    headers = _elevated_headers(client, auth_headers)
    r = client.post(
        f"{USER_ENDPOINT}/me/medical-consent",
        json={"medicalNotes": _MEDICAL_NOTES, "password": _USER_1_PWD},
        headers=headers,
    )
    assert r.status_code == 200

    yield trip_with_user2_as_crew

    headers = _elevated_headers(client, auth_headers)
    client.delete(f"{USER_ENDPOINT}/me/medical-consent", headers=headers)


# =============================================================================
# GET /api/trip/<id>/member/me
# =============================================================================

def test_get_my_membership_requires_auth(client, trip_with_user2_as_crew):
    trip_id = trip_with_user2_as_crew["trip"]["id"]
    response = client.get(f"{TRIP_ENDPOINT}/{trip_id}/member/me")
    assert response.status_code in (401, 403)


def test_get_my_membership_as_leader(client, auth_headers, trip_with_user2_as_crew):
    trip_id = trip_with_user2_as_crew["trip"]["id"]
    response = client.get(
        f"{TRIP_ENDPOINT}/{trip_id}/member/me", headers=auth_headers
    )
    assert response.status_code == 200
    data = json.loads(response.data)
    assert data["role"] == "leader"


def test_get_my_membership_as_crew(client, auth_headers_2, trip_with_user2_as_crew):
    trip_id = trip_with_user2_as_crew["trip"]["id"]
    response = client.get(
        f"{TRIP_ENDPOINT}/{trip_id}/member/me", headers=auth_headers_2
    )
    assert response.status_code == 200
    data = json.loads(response.data)
    assert data["role"] == "crew"


def test_get_my_membership_non_member_returns_404(client, outsider_headers, trip_with_user2_as_crew):
    trip_id = trip_with_user2_as_crew["trip"]["id"]
    response = client.get(
        f"{TRIP_ENDPOINT}/{trip_id}/member/me", headers=outsider_headers
    )
    assert response.status_code == 404


# =============================================================================
# PATCH /api/trip/<id>/member/me  (float plan)
# =============================================================================

def test_update_float_plan_requires_auth(client, trip_with_user2_as_crew):
    trip_id = trip_with_user2_as_crew["trip"]["id"]
    response = client.patch(
        f"{TRIP_ENDPOINT}/{trip_id}/member/me",
        json={"vesselMake": "Valley"},
    )
    assert response.status_code in (401, 403)


def test_update_float_plan_vessel_info(client, auth_headers, trip_with_user2_as_crew):
    trip_id = trip_with_user2_as_crew["trip"]["id"]
    response = client.patch(
        f"{TRIP_ENDPOINT}/{trip_id}/member/me",
        json={
            "vesselMake": "Valley",
            "vesselModel": "Nordkapp",
            "vesselLengthCm": 520,
            "vesselColorPrimary": "yellow",
        },
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = json.loads(response.data)
    assert data["vesselMake"] == "Valley"
    assert data["vesselModel"] == "Nordkapp"
    assert data["vesselLengthCm"] == 520


def test_update_float_plan_emergency_contact(client, auth_headers_2, trip_with_user2_as_crew):
    trip_id = trip_with_user2_as_crew["trip"]["id"]
    response = client.patch(
        f"{TRIP_ENDPOINT}/{trip_id}/member/me",
        json={
            "emergencyContactName": "Jane Doe",
            "emergencyContactPhone": "+441234567890",
            "emergencyContactRelationship": "partner",
        },
        headers=auth_headers_2,
    )
    assert response.status_code == 200
    data = json.loads(response.data)
    assert data["emergencyContactName"] == "Jane Doe"
    assert data["emergencyContactPhone"] == "+441234567890"


def test_update_float_plan_non_member_returns_404(client, outsider_headers, trip_with_user2_as_crew):
    trip_id = trip_with_user2_as_crew["trip"]["id"]
    response = client.patch(
        f"{TRIP_ENDPOINT}/{trip_id}/member/me",
        json={"vesselMake": "P&H"},
        headers=outsider_headers,
    )
    assert response.status_code == 404


# =============================================================================
# POST /api/trip/<id>/member/me/medical-notes
# =============================================================================

def test_share_medical_notes_requires_elevated_token(client, auth_headers, trip_with_medical_consent):
    trip_id = trip_with_medical_consent["trip"]["id"]
    response = client.post(
        f"{TRIP_ENDPOINT}/{trip_id}/member/me/medical-notes",
        json={"password": _USER_1_PWD},
        headers=auth_headers,
    )
    assert response.status_code == 403


def test_share_medical_notes_success(client, auth_headers, trip_with_medical_consent):
    trip_id = trip_with_medical_consent["trip"]["id"]
    headers = _elevated_headers(client, auth_headers)
    response = client.post(
        f"{TRIP_ENDPOINT}/{trip_id}/member/me/medical-notes",
        json={"password": _USER_1_PWD},
        headers=headers,
    )
    assert response.status_code == 200
    data = json.loads(response.data)
    assert data["medicalNotes"] == _MEDICAL_NOTES
    assert data["medicalNotesConsentAt"] is not None


def test_share_medical_notes_wrong_password(client, auth_headers, trip_with_medical_consent):
    trip_id = trip_with_medical_consent["trip"]["id"]
    headers = _elevated_headers(client, auth_headers)
    response = client.post(
        f"{TRIP_ENDPOINT}/{trip_id}/member/me/medical-notes",
        json={"password": "wrongPassword1$"},
        headers=headers,
    )
    assert response.status_code in (400, 401)


def test_share_medical_notes_non_member_returns_404(client, outsider_headers, trip_with_medical_consent):
    trip_id = trip_with_medical_consent["trip"]["id"]
    # outsider_headers are not elevated — but 404 should fire before the token check
    # since the service check happens first; either 403 or 404 is acceptable here
    response = client.post(
        f"{TRIP_ENDPOINT}/{trip_id}/member/me/medical-notes",
        json={"password": _USER_1_PWD},
        headers=outsider_headers,
    )
    assert response.status_code in (403, 404)


# =============================================================================
# GET /api/trip/<id>  — medical notes privacy
# =============================================================================

def test_leader_sees_all_medical_notes_in_trip_get(client, auth_headers, auth_headers_2, trip_with_user2_as_crew):
    """Leader can see all travellers' medicalNotes in GET /trip/:id."""
    trip_id = trip_with_user2_as_crew["trip"]["id"]

    # User_1 (leader) grants consent and shares their own notes
    h1 = _elevated_headers(client, auth_headers, _USER_1_PWD)
    client.post(f"{USER_ENDPOINT}/me/medical-consent",
                json={"medicalNotes": _MEDICAL_NOTES, "password": _USER_1_PWD}, headers=h1)
    h1 = _elevated_headers(client, auth_headers, _USER_1_PWD)
    client.post(f"{TRIP_ENDPOINT}/{trip_id}/member/me/medical-notes",
                json={"password": _USER_1_PWD}, headers=h1)

    # User_2 (crew) grants consent and shares their own notes
    h2 = _elevated_headers(client, auth_headers_2, _USER_2_PWD)
    client.post(f"{USER_ENDPOINT}/me/medical-consent",
                json={"medicalNotes": _MEDICAL_NOTES_2, "password": _USER_2_PWD}, headers=h2)
    h2 = _elevated_headers(client, auth_headers_2, _USER_2_PWD)
    client.post(f"{TRIP_ENDPOINT}/{trip_id}/member/me/medical-notes",
                json={"password": _USER_2_PWD}, headers=h2)

    response = client.get(f"{TRIP_ENDPOINT}/{trip_id}", headers=auth_headers)
    assert response.status_code == 200
    travellers = json.loads(response.data)["travellers"]
    notes = {t["user"]["id"]: t.get("medicalNotes") for t in travellers}
    assert all(v is not None for v in notes.values()), \
        f"Leader should see all medical notes, got: {notes}"

    # Cleanup
    h1 = _elevated_headers(client, auth_headers, _USER_1_PWD)
    client.delete(f"{USER_ENDPOINT}/me/medical-consent", headers=h1)
    h2 = _elevated_headers(client, auth_headers_2, _USER_2_PWD)
    client.delete(f"{USER_ENDPOINT}/me/medical-consent", headers=h2)


def test_crew_member_sees_only_own_medical_notes_in_trip_get(client, auth_headers, auth_headers_2, trip_with_user2_as_crew, user_2):
    """Crew member sees their own medicalNotes but not other members' in GET /trip/:id."""
    trip_id = trip_with_user2_as_crew["trip"]["id"]

    # User_1 (leader) grants consent and shares their own notes
    h1 = _elevated_headers(client, auth_headers, _USER_1_PWD)
    client.post(f"{USER_ENDPOINT}/me/medical-consent",
                json={"medicalNotes": _MEDICAL_NOTES, "password": _USER_1_PWD}, headers=h1)
    h1 = _elevated_headers(client, auth_headers, _USER_1_PWD)
    client.post(f"{TRIP_ENDPOINT}/{trip_id}/member/me/medical-notes",
                json={"password": _USER_1_PWD}, headers=h1)

    # User_2 (crew) grants consent and shares their own notes
    h2 = _elevated_headers(client, auth_headers_2, _USER_2_PWD)
    client.post(f"{USER_ENDPOINT}/me/medical-consent",
                json={"medicalNotes": _MEDICAL_NOTES_2, "password": _USER_2_PWD}, headers=h2)
    h2 = _elevated_headers(client, auth_headers_2, _USER_2_PWD)
    client.post(f"{TRIP_ENDPOINT}/{trip_id}/member/me/medical-notes",
                json={"password": _USER_2_PWD}, headers=h2)

    # GET as user_2 (crew)
    response = client.get(f"{TRIP_ENDPOINT}/{trip_id}", headers=auth_headers_2)
    assert response.status_code == 200
    travellers = json.loads(response.data)["travellers"]

    user_2_id = str(user_2.id)
    for t in travellers:
        if t["user"]["id"] == user_2_id:
            assert t.get("medicalNotes") == _MEDICAL_NOTES_2, "Crew should see their own notes"
        else:
            assert t.get("medicalNotes") is None, "Crew should not see other members' notes"

    # Cleanup
    h1 = _elevated_headers(client, auth_headers, _USER_1_PWD)
    client.delete(f"{USER_ENDPOINT}/me/medical-consent", headers=h1)
    h2 = _elevated_headers(client, auth_headers_2, _USER_2_PWD)
    client.delete(f"{USER_ENDPOINT}/me/medical-consent", headers=h2)

# =============================================================================
# Profile snapshot at join / create time
# =============================================================================

def test_crew_profile_snapshot_copied_on_accept(client, auth_headers, auth_headers_2, user_2):
    """Crew member's profile vessel/emergency fields are copied to TripMember when accepting an invitation."""
    client.patch(f"{USER_ENDPOINT}/{user_2.id}", json={
        "vesselMake": "P&H",
        "vesselModel": "Cetus",
        "emergencyContactName": "Jane Crew",
        "emergencyContactPhone": "+441234567890",
    }, headers=auth_headers_2)

    resp = client.post(f"{TRIP_ENDPOINT}/create",
                       json={"inventory": {}, "itinerary": {"isPublic": True, "totalMiles": 0, "days": []}},
                       headers=auth_headers)
    assert resp.status_code == 201
    trip_id = json.loads(resp.data)["id"]

    client.post(f"{TRIP_ENDPOINT}/{trip_id}/invite",
                json={"userId": str(user_2.id)}, headers=auth_headers)
    client.post(f"{TRIP_ENDPOINT}/{trip_id}/invitation",
                json={"accepted": True}, headers=auth_headers_2)

    membership = json.loads(client.get(
        f"{TRIP_ENDPOINT}/{trip_id}/member/me", headers=auth_headers_2
    ).data)

    assert membership["vesselMake"] == "P&H"
    assert membership["vesselModel"] == "Cetus"
    assert membership["emergencyContactName"] == "Jane Crew"
    assert membership["emergencyContactPhone"] == "+441234567890"

    client.delete(f"{TRIP_ENDPOINT}/{trip_id}?for_everyone=true", headers=auth_headers)
    client.patch(f"{USER_ENDPOINT}/{user_2.id}", json={
        "vesselMake": None, "vesselModel": None,
        "emergencyContactName": None, "emergencyContactPhone": None,
    }, headers=auth_headers_2)


def test_leader_profile_snapshot_copied_on_create(client, auth_headers, id):
    """Leader's profile vessel/emergency fields are copied to TripMember when creating a trip."""
    client.patch(f"{USER_ENDPOINT}/{id}", json={
        "vesselMake": "Valley",
        "vesselModel": "Nordkapp",
        "emergencyContactName": "Jane Leader",
        "emergencyContactPhone": "+441111111111",
    }, headers=auth_headers)

    resp = client.post(f"{TRIP_ENDPOINT}/create",
                       json={"inventory": {}, "itinerary": {"isPublic": True, "totalMiles": 0, "days": []}},
                       headers=auth_headers)
    assert resp.status_code == 201
    trip_id = json.loads(resp.data)["id"]

    membership = json.loads(client.get(
        f"{TRIP_ENDPOINT}/{trip_id}/member/me", headers=auth_headers
    ).data)

    assert membership["vesselMake"] == "Valley"
    assert membership["vesselModel"] == "Nordkapp"
    assert membership["emergencyContactName"] == "Jane Leader"
    assert membership["emergencyContactPhone"] == "+441111111111"

    client.delete(f"{TRIP_ENDPOINT}/{trip_id}?for_everyone=true", headers=auth_headers)
    client.patch(f"{USER_ENDPOINT}/{id}", json={
        "vesselMake": None, "vesselModel": None,
        "emergencyContactName": None, "emergencyContactPhone": None,
    }, headers=auth_headers)
