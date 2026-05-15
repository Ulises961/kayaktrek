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
# POST /api/trip/<id>/member/me/medical-consent  (save encrypted trip notes)
# DELETE /api/trip/<id>/member/me/medical-consent (revoke trip notes)
# POST /api/trip/<id>/member/me/medical-notes     (read/decrypt trip notes)
# POST /api/trip/<id>/member/me/share-medical-notes (share plaintext with leader)
# =============================================================================

def test_set_trip_medical_notes_requires_elevated_token(client, auth_headers, trip_with_user2_as_crew):
    trip_id = trip_with_user2_as_crew["trip"]["id"]
    response = client.post(
        f"{TRIP_ENDPOINT}/{trip_id}/member/me/medical-consent",
        json={"medicalNotes": _MEDICAL_NOTES, "password": _USER_1_PWD},
        headers=auth_headers,
    )
    assert response.status_code == 403


def test_set_trip_medical_notes_success(client, auth_headers, trip_with_user2_as_crew):
    trip_id = trip_with_user2_as_crew["trip"]["id"]
    headers = _elevated_headers(client, auth_headers)
    response = client.post(
        f"{TRIP_ENDPOINT}/{trip_id}/member/me/medical-consent",
        json={"medicalNotes": _MEDICAL_NOTES, "password": _USER_1_PWD},
        headers=headers,
    )
    assert response.status_code == 200
    data = json.loads(response.data)
    assert data["hasTripMedicalNotes"] is True
    assert "medicalNotesCiphertext" not in data


def test_get_trip_medical_notes_requires_elevated_token(client, auth_headers, trip_with_user2_as_crew):
    trip_id = trip_with_user2_as_crew["trip"]["id"]
    response = client.post(
        f"{TRIP_ENDPOINT}/{trip_id}/member/me/medical-notes",
        json={"password": _USER_1_PWD},
        headers=auth_headers,
    )
    assert response.status_code == 403


def test_get_trip_medical_notes_none_stored(client, auth_headers, trip_with_user2_as_crew):
    trip_id = trip_with_user2_as_crew["trip"]["id"]
    headers = _elevated_headers(client, auth_headers)
    response = client.post(
        f"{TRIP_ENDPOINT}/{trip_id}/member/me/medical-notes",
        json={"password": _USER_1_PWD},
        headers=headers,
    )
    assert response.status_code == 200
    data = json.loads(response.data)
    assert data["medicalNotes"] is None


def test_get_trip_medical_notes_roundtrip(client, auth_headers, trip_with_user2_as_crew):
    trip_id = trip_with_user2_as_crew["trip"]["id"]
    headers = _elevated_headers(client, auth_headers)
    client.post(
        f"{TRIP_ENDPOINT}/{trip_id}/member/me/medical-consent",
        json={"medicalNotes": _MEDICAL_NOTES, "password": _USER_1_PWD},
        headers=headers,
    )
    headers = _elevated_headers(client, auth_headers)
    response = client.post(
        f"{TRIP_ENDPOINT}/{trip_id}/member/me/medical-notes",
        json={"password": _USER_1_PWD},
        headers=headers,
    )
    assert response.status_code == 200
    assert json.loads(response.data)["medicalNotes"] == _MEDICAL_NOTES

    # Cleanup
    headers = _elevated_headers(client, auth_headers)
    client.delete(f"{TRIP_ENDPOINT}/{trip_id}/member/me/medical-consent", headers=headers)


def test_get_trip_medical_notes_wrong_password(client, auth_headers, trip_with_user2_as_crew):
    trip_id = trip_with_user2_as_crew["trip"]["id"]
    headers = _elevated_headers(client, auth_headers)
    client.post(
        f"{TRIP_ENDPOINT}/{trip_id}/member/me/medical-consent",
        json={"medicalNotes": _MEDICAL_NOTES, "password": _USER_1_PWD},
        headers=headers,
    )
    headers = _elevated_headers(client, auth_headers)
    response = client.post(
        f"{TRIP_ENDPOINT}/{trip_id}/member/me/medical-notes",
        json={"password": "wrongPassword1$"},
        headers=headers,
    )
    assert response.status_code in (400, 401)

    # Cleanup
    headers = _elevated_headers(client, auth_headers)
    client.delete(f"{TRIP_ENDPOINT}/{trip_id}/member/me/medical-consent", headers=headers)


def test_revoke_trip_medical_notes_requires_elevated_token(client, auth_headers, trip_with_user2_as_crew):
    trip_id = trip_with_user2_as_crew["trip"]["id"]
    response = client.delete(
        f"{TRIP_ENDPOINT}/{trip_id}/member/me/medical-consent",
        headers=auth_headers,
    )
    assert response.status_code == 403


def test_revoke_trip_medical_notes_success(client, auth_headers, trip_with_user2_as_crew):
    trip_id = trip_with_user2_as_crew["trip"]["id"]
    headers = _elevated_headers(client, auth_headers)
    client.post(
        f"{TRIP_ENDPOINT}/{trip_id}/member/me/medical-consent",
        json={"medicalNotes": _MEDICAL_NOTES, "password": _USER_1_PWD},
        headers=headers,
    )
    headers = _elevated_headers(client, auth_headers)
    response = client.delete(
        f"{TRIP_ENDPOINT}/{trip_id}/member/me/medical-consent",
        headers=headers,
    )
    assert response.status_code == 200
    assert json.loads(response.data)["hasTripMedicalNotes"] is False


def test_share_medical_notes_requires_elevated_token(client, auth_headers, trip_with_user2_as_crew):
    trip_id = trip_with_user2_as_crew["trip"]["id"]
    response = client.post(
        f"{TRIP_ENDPOINT}/{trip_id}/member/me/share-medical-notes",
        json={"password": _USER_1_PWD},
        headers=auth_headers,
    )
    assert response.status_code == 403


def test_share_medical_notes_success(client, auth_headers, trip_with_user2_as_crew):
    trip_id = trip_with_user2_as_crew["trip"]["id"]
    headers = _elevated_headers(client, auth_headers)
    client.post(
        f"{TRIP_ENDPOINT}/{trip_id}/member/me/medical-consent",
        json={"medicalNotes": _MEDICAL_NOTES, "password": _USER_1_PWD},
        headers=headers,
    )
    headers = _elevated_headers(client, auth_headers)
    response = client.post(
        f"{TRIP_ENDPOINT}/{trip_id}/member/me/share-medical-notes",
        json={"password": _USER_1_PWD},
        headers=headers,
    )
    assert response.status_code == 200
    data = json.loads(response.data)
    assert data["medicalNotes"] == _MEDICAL_NOTES
    assert data["medicalNotesConsentAt"] is not None

    # Cleanup
    headers = _elevated_headers(client, auth_headers)
    client.delete(f"{TRIP_ENDPOINT}/{trip_id}/member/me/medical-consent", headers=headers)


def test_share_medical_notes_no_trip_notes_stored(client, auth_headers, trip_with_user2_as_crew):
    trip_id = trip_with_user2_as_crew["trip"]["id"]
    headers = _elevated_headers(client, auth_headers)
    response = client.post(
        f"{TRIP_ENDPOINT}/{trip_id}/member/me/share-medical-notes",
        json={"password": _USER_1_PWD},
        headers=headers,
    )
    assert response.status_code == 400


def test_share_medical_notes_wrong_password(client, auth_headers, trip_with_user2_as_crew):
    trip_id = trip_with_user2_as_crew["trip"]["id"]
    headers = _elevated_headers(client, auth_headers)
    client.post(
        f"{TRIP_ENDPOINT}/{trip_id}/member/me/medical-consent",
        json={"medicalNotes": _MEDICAL_NOTES, "password": _USER_1_PWD},
        headers=headers,
    )
    headers = _elevated_headers(client, auth_headers)
    response = client.post(
        f"{TRIP_ENDPOINT}/{trip_id}/member/me/share-medical-notes",
        json={"password": "wrongPassword1$"},
        headers=headers,
    )
    assert response.status_code in (400, 401)

    # Cleanup
    headers = _elevated_headers(client, auth_headers)
    client.delete(f"{TRIP_ENDPOINT}/{trip_id}/member/me/medical-consent", headers=headers)


def test_share_medical_notes_non_member_returns_404(client, outsider_headers, trip_with_user2_as_crew):
    trip_id = trip_with_user2_as_crew["trip"]["id"]
    response = client.post(
        f"{TRIP_ENDPOINT}/{trip_id}/member/me/share-medical-notes",
        json={"password": _USER_1_PWD},
        headers=outsider_headers,
    )
    assert response.status_code in (403, 404)


# =============================================================================
# GET /api/trip/<id>  — medical notes privacy
# =============================================================================

def _set_and_share_trip_notes(client, auth_headers, trip_id, notes, password):
    """Helper: save trip-level encrypted notes then share with leader (two-step)."""
    h = _elevated_headers(client, auth_headers, password)
    client.post(f"{TRIP_ENDPOINT}/{trip_id}/member/me/medical-consent",
                json={"medicalNotes": notes, "password": password}, headers=h)
    h = _elevated_headers(client, auth_headers, password)
    client.post(f"{TRIP_ENDPOINT}/{trip_id}/member/me/share-medical-notes",
                json={"password": password}, headers=h)


@pytest.mark.xfail(reason="§5 M3g: share_medical_notes rewired to ECIES; GET /trip/:id will expose has_leader_medical_notes flag, not plaintext")
def test_leader_sees_all_medical_notes_in_trip_get(client, auth_headers, auth_headers_2, trip_with_user2_as_crew):
    """Leader can see all travellers' medicalNotes in GET /trip/:id."""
    trip_id = trip_with_user2_as_crew["trip"]["id"]

    _set_and_share_trip_notes(client, auth_headers, trip_id, _MEDICAL_NOTES, _USER_1_PWD)
    _set_and_share_trip_notes(client, auth_headers_2, trip_id, _MEDICAL_NOTES_2, _USER_2_PWD)

    response = client.get(f"{TRIP_ENDPOINT}/{trip_id}", headers=auth_headers)
    assert response.status_code == 200
    travellers = json.loads(response.data)["travellers"]
    notes = {t["user"]["id"]: t.get("medicalNotes") for t in travellers}
    assert all(v is not None for v in notes.values()), \
        f"Leader should see all medical notes, got: {notes}"

    # Cleanup
    h1 = _elevated_headers(client, auth_headers, _USER_1_PWD)
    client.delete(f"{TRIP_ENDPOINT}/{trip_id}/member/me/medical-consent", headers=h1)
    h2 = _elevated_headers(client, auth_headers_2, _USER_2_PWD)
    client.delete(f"{TRIP_ENDPOINT}/{trip_id}/member/me/medical-consent", headers=h2)


@pytest.mark.xfail(reason="§5 M3g: share_medical_notes rewired to ECIES; crew plaintext-visibility model changes in §5/§6")
def test_crew_member_sees_only_own_medical_notes_in_trip_get(client, auth_headers, auth_headers_2, trip_with_user2_as_crew, user_2):
    """Crew member sees their own medicalNotes but not other members' in GET /trip/:id."""
    trip_id = trip_with_user2_as_crew["trip"]["id"]

    _set_and_share_trip_notes(client, auth_headers, trip_id, _MEDICAL_NOTES, _USER_1_PWD)
    _set_and_share_trip_notes(client, auth_headers_2, trip_id, _MEDICAL_NOTES_2, _USER_2_PWD)

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
    client.delete(f"{TRIP_ENDPOINT}/{trip_id}/member/me/medical-consent", headers=h1)
    h2 = _elevated_headers(client, auth_headers_2, _USER_2_PWD)
    client.delete(f"{TRIP_ENDPOINT}/{trip_id}/member/me/medical-consent", headers=h2)

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
                json={"email": user_2.mail}, headers=auth_headers)
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
