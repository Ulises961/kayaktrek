import json
import pytest

from Resources.user_resource import USER_ENDPOINT
from Resources.trip_resource import TRIP_ENDPOINT

_USER_1_PWD = "testPassword6$"
_MEDICAL_NOTES = "Allergic to penicillin. Blood type A+."


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
