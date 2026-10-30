import json
import pytest

from cryptography.exceptions import InvalidTag

from Resources.user_resource import USER_ENDPOINT
from Resources.trip_resource import TRIP_ENDPOINT
from Services.crypto_service import (
    decrypt, decrypt_as_recipient, encrypt, encrypt_for_recipient,
)

_USER_1_PWD = "testPassword6$"
_USER_2_PWD = "pwdTest2$"
_MEDICAL_NOTES = "Allergic to penicillin. Blood type A+."
_MEDICAL_NOTES_2 = "No known allergies. Blood type O+."


def _sealed(plaintext=_MEDICAL_NOTES, password=_USER_1_PWD):
    """Seal notes the way the client does since M22 — with crypto_service, the same
    code that produced every ciphertext already in the database."""
    ciphertext, nonce, salt = encrypt(plaintext, password)
    return {"ciphertext": ciphertext, "nonce": nonce, "salt": salt}


def _sealed_for_leader(client, headers, trip_id, plaintext=_MEDICAL_NOTES):
    """Fetch the leader's public key and ECIES-seal to it, as a crew client does."""
    response = client.get(
        f"{TRIP_ENDPOINT}/{trip_id}/member/me/leader-public-key", headers=headers,
    )
    assert response.status_code == 200
    ciphertext, nonce, ephemeral = encrypt_for_recipient(
        plaintext, json.loads(response.data)["publicKey"],
    )
    return {"ciphertext": ciphertext, "nonce": nonce, "ephemeralKey": ephemeral}


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


def test_float_plan_keeps_an_ampersand_through_save_and_edit(client, auth_headers, trip_with_user2_as_crew):
    trip_id = trip_with_user2_as_crew["trip"]["id"]
    url = f"{TRIP_ENDPOINT}/{trip_id}/member/me"

    saved = client.patch(url, json={"vesselMake": "P&H"}, headers=auth_headers)
    assert saved.status_code == 200
    assert json.loads(saved.data)["vesselMake"] == "P&H"

    stored = json.loads(client.get(url, headers=auth_headers).data)["vesselMake"]
    assert stored == "P&H"

    resaved = client.patch(url, json={"vesselMake": stored}, headers=auth_headers)
    assert json.loads(resaved.data)["vesselMake"] == "P&H"


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
# POST /api/trip/<id>/member/me/medical-consent   (store sealed trip notes)
# DELETE /api/trip/<id>/member/me/medical-consent (revoke trip notes)
# GET /api/trip/<id>/member/me/medical-notes      (fetch sealed trip notes)
# GET /api/trip/<id>/member/me/leader-public-key  (key to seal for the leader)
# POST /api/trip/<id>/member/me/share-medical-notes (store the leader's sealed copy)
# =============================================================================

def test_set_trip_medical_notes_requires_elevated_token(client, auth_headers, trip_with_user2_as_crew):
    trip_id = trip_with_user2_as_crew["trip"]["id"]
    response = client.post(
        f"{TRIP_ENDPOINT}/{trip_id}/member/me/medical-consent",
        json=_sealed(),
        headers=auth_headers,
    )
    assert response.status_code == 403

    # The denial must be a true no-op — no notes got stored without the elevated token.
    membership = json.loads(
        client.get(f"{TRIP_ENDPOINT}/{trip_id}/member/me", headers=auth_headers).data
    )
    assert membership["hasTripMedicalNotes"] is False


def test_set_trip_medical_notes_success(client, auth_headers, trip_with_user2_as_crew):
    trip_id = trip_with_user2_as_crew["trip"]["id"]
    headers = _elevated_headers(client, auth_headers)
    response = client.post(
        f"{TRIP_ENDPOINT}/{trip_id}/member/me/medical-consent",
        json=_sealed(),
        headers=headers,
    )
    assert response.status_code == 200
    data = json.loads(response.data)
    assert data["hasTripMedicalNotes"] is True
    assert "medicalNotesCiphertext" not in data


def test_set_trip_medical_notes_rejects_plaintext_body(client, auth_headers, trip_with_user2_as_crew):
    """The pre-M22 body shape must fail loudly rather than storing a plaintext note
    that everything downstream will then try to decrypt."""
    trip_id = trip_with_user2_as_crew["trip"]["id"]
    headers = _elevated_headers(client, auth_headers)
    response = client.post(
        f"{TRIP_ENDPOINT}/{trip_id}/member/me/medical-consent",
        json={"medicalNotes": _MEDICAL_NOTES, "password": _USER_1_PWD},
        headers=headers,
    )
    assert response.status_code == 400


def test_get_trip_medical_notes_requires_elevated_token(client, auth_headers, trip_with_user2_as_crew):
    trip_id = trip_with_user2_as_crew["trip"]["id"]
    response = client.get(
        f"{TRIP_ENDPOINT}/{trip_id}/member/me/medical-notes",
        headers=auth_headers,
    )
    assert response.status_code == 403


def test_get_trip_medical_notes_none_stored(client, auth_headers, trip_with_user2_as_crew):
    trip_id = trip_with_user2_as_crew["trip"]["id"]
    headers = _elevated_headers(client, auth_headers)
    response = client.get(
        f"{TRIP_ENDPOINT}/{trip_id}/member/me/medical-notes",
        headers=headers,
    )
    assert response.status_code == 200
    assert json.loads(response.data) == {"ciphertext": None, "nonce": None, "salt": None}


def test_get_trip_medical_notes_roundtrip(client, auth_headers, trip_with_user2_as_crew):
    trip_id = trip_with_user2_as_crew["trip"]["id"]
    sealed = _sealed()
    headers = _elevated_headers(client, auth_headers)
    client.post(
        f"{TRIP_ENDPOINT}/{trip_id}/member/me/medical-consent",
        json=sealed,
        headers=headers,
    )
    headers = _elevated_headers(client, auth_headers)
    response = client.get(
        f"{TRIP_ENDPOINT}/{trip_id}/member/me/medical-notes",
        headers=headers,
    )
    assert response.status_code == 200
    data = json.loads(response.data)
    # Stored and returned untouched — the server is a store, not a decryptor.
    assert data == sealed
    assert decrypt(
        data["ciphertext"], data["nonce"], data["salt"], _USER_1_PWD,
    ) == _MEDICAL_NOTES

    # Cleanup
    headers = _elevated_headers(client, auth_headers)
    client.delete(f"{TRIP_ENDPOINT}/{trip_id}/member/me/medical-consent", headers=headers)


def test_revoke_trip_medical_notes_requires_elevated_token(client, auth_headers, trip_with_user2_as_crew):
    trip_id = trip_with_user2_as_crew["trip"]["id"]

    headers = _elevated_headers(client, auth_headers)
    client.post(
        f"{TRIP_ENDPOINT}/{trip_id}/member/me/medical-consent",
        json=_sealed(),
        headers=headers,
    )

    response = client.delete(
        f"{TRIP_ENDPOINT}/{trip_id}/member/me/medical-consent",
        headers=auth_headers,
    )
    assert response.status_code == 403

    # The denial must be a true no-op — the notes set up above must survive it.
    membership = json.loads(
        client.get(f"{TRIP_ENDPOINT}/{trip_id}/member/me", headers=auth_headers).data
    )
    assert membership["hasTripMedicalNotes"] is True

    # Cleanup
    headers = _elevated_headers(client, auth_headers)
    client.delete(f"{TRIP_ENDPOINT}/{trip_id}/member/me/medical-consent", headers=headers)


def test_revoke_trip_medical_notes_success(client, auth_headers, trip_with_user2_as_crew):
    trip_id = trip_with_user2_as_crew["trip"]["id"]
    headers = _elevated_headers(client, auth_headers)
    client.post(
        f"{TRIP_ENDPOINT}/{trip_id}/member/me/medical-consent",
        json=_sealed(),
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

    headers = _elevated_headers(client, auth_headers)
    client.post(
        f"{TRIP_ENDPOINT}/{trip_id}/member/me/medical-consent",
        json=_sealed(),
        headers=headers,
    )

    response = client.post(
        f"{TRIP_ENDPOINT}/{trip_id}/member/me/share-medical-notes",
        json=_sealed_for_leader(client, auth_headers, trip_id),
        headers=auth_headers,
    )
    assert response.status_code == 403

    # The denial must be a true no-op — the notes must not have been shared with the leader.
    membership = json.loads(
        client.get(f"{TRIP_ENDPOINT}/{trip_id}/member/me", headers=auth_headers).data
    )
    assert membership["hasLeaderMedicalNotes"] is False

    # Cleanup
    headers = _elevated_headers(client, auth_headers)
    client.delete(f"{TRIP_ENDPOINT}/{trip_id}/member/me/medical-consent", headers=headers)


def test_share_medical_notes_success(client, auth_headers, trip_with_user2_as_crew):
    trip_id = trip_with_user2_as_crew["trip"]["id"]
    headers = _elevated_headers(client, auth_headers)
    client.post(
        f"{TRIP_ENDPOINT}/{trip_id}/member/me/medical-consent",
        json=_sealed(),
        headers=headers,
    )
    sealed_for_leader = _sealed_for_leader(client, auth_headers, trip_id)
    headers = _elevated_headers(client, auth_headers)
    response = client.post(
        f"{TRIP_ENDPOINT}/{trip_id}/member/me/share-medical-notes",
        json=sealed_for_leader,
        headers=headers,
    )
    assert response.status_code == 200
    data = json.loads(response.data)
    assert data["hasLeaderMedicalNotes"] is True
    assert data["medicalNotesConsentAt"] is not None

    # Cleanup
    headers = _elevated_headers(client, auth_headers)
    client.delete(f"{TRIP_ENDPOINT}/{trip_id}/member/me/medical-consent", headers=headers)


def test_share_medical_notes_no_trip_notes_stored(client, auth_headers, trip_with_user2_as_crew):
    trip_id = trip_with_user2_as_crew["trip"]["id"]
    sealed_for_leader = _sealed_for_leader(client, auth_headers, trip_id)
    headers = _elevated_headers(client, auth_headers)
    response = client.post(
        f"{TRIP_ENDPOINT}/{trip_id}/member/me/share-medical-notes",
        json=sealed_for_leader,
        headers=headers,
    )
    assert response.status_code == 400


def test_share_medical_notes_missing_ephemeral_key_returns_400(client, auth_headers, trip_with_user2_as_crew):
    """Without the ephemeral public key the leader's copy can never be decrypted, so a
    partial blob must not be stored beside a hasLeaderMedicalNotes flag saying it can."""
    trip_id = trip_with_user2_as_crew["trip"]["id"]
    headers = _elevated_headers(client, auth_headers)
    client.post(
        f"{TRIP_ENDPOINT}/{trip_id}/member/me/medical-consent",
        json=_sealed(),
        headers=headers,
    )
    partial = _sealed_for_leader(client, auth_headers, trip_id)
    del partial["ephemeralKey"]
    headers = _elevated_headers(client, auth_headers)
    response = client.post(
        f"{TRIP_ENDPOINT}/{trip_id}/member/me/share-medical-notes",
        json=partial,
        headers=headers,
    )
    assert response.status_code == 400

    membership = json.loads(
        client.get(f"{TRIP_ENDPOINT}/{trip_id}/member/me", headers=auth_headers).data
    )
    assert membership["hasLeaderMedicalNotes"] is False

    # Cleanup
    headers = _elevated_headers(client, auth_headers)
    client.delete(f"{TRIP_ENDPOINT}/{trip_id}/member/me/medical-consent", headers=headers)


def test_share_medical_notes_non_member_returns_404(client, outsider_headers, trip_with_user2_as_crew):
    trip_id = trip_with_user2_as_crew["trip"]["id"]
    response = client.post(
        f"{TRIP_ENDPOINT}/{trip_id}/member/me/share-medical-notes",
        json={"ciphertext": "Y3Q=", "nonce": "bm9uY2U=", "ephemeralKey": "ZXBo"},
        headers=outsider_headers,
    )
    assert response.status_code in (403, 404)


# =============================================================================
# GET /api/trip/<id>/member/me/leader-public-key
# =============================================================================

def test_leader_public_key_returned_to_a_member(client, auth_headers_2, trip_with_user2_as_crew):
    """Crew need the leader's public key to seal for them — public material, so no
    elevated token, but membership of the trip is still the gate."""
    trip_id = trip_with_user2_as_crew["trip"]["id"]
    response = client.get(
        f"{TRIP_ENDPOINT}/{trip_id}/member/me/leader-public-key", headers=auth_headers_2,
    )
    assert response.status_code == 200
    assert json.loads(response.data)["publicKey"]


def test_leader_public_key_non_member_returns_404(client, outsider_headers, trip_with_user2_as_crew):
    trip_id = trip_with_user2_as_crew["trip"]["id"]
    response = client.get(
        f"{TRIP_ENDPOINT}/{trip_id}/member/me/leader-public-key", headers=outsider_headers,
    )
    assert response.status_code in (403, 404)


# =============================================================================
# GET /api/trip/<id>  — medical notes privacy
# =============================================================================

def _set_and_share_trip_notes(client, auth_headers, trip_id, notes, password):
    """Helper: store the member's own sealed notes, then the leader-sealed copy."""
    h = _elevated_headers(client, auth_headers, password)
    client.post(f"{TRIP_ENDPOINT}/{trip_id}/member/me/medical-consent",
                json=_sealed(notes, password), headers=h)
    for_leader = _sealed_for_leader(client, auth_headers, trip_id, notes)
    h = _elevated_headers(client, auth_headers, password)
    client.post(f"{TRIP_ENDPOINT}/{trip_id}/member/me/share-medical-notes",
                json=for_leader, headers=h)


def test_leader_sees_has_leader_medical_notes_flag_in_trip_get(client, auth_headers, auth_headers_2, trip_with_user2_as_crew):
    """After sharing, hasLeaderMedicalNotes is true for all travellers in GET /trip/:id."""
    trip_id = trip_with_user2_as_crew["trip"]["id"]

    _set_and_share_trip_notes(client, auth_headers, trip_id, _MEDICAL_NOTES, _USER_1_PWD)
    _set_and_share_trip_notes(client, auth_headers_2, trip_id, _MEDICAL_NOTES_2, _USER_2_PWD)

    response = client.get(f"{TRIP_ENDPOINT}/{trip_id}", headers=auth_headers)
    assert response.status_code == 200
    travellers = json.loads(response.data)["travellers"]
    flags = {t["user"]["id"]: t.get("hasLeaderMedicalNotes") for t in travellers}
    assert all(v is True for v in flags.values()), \
        f"All travellers should have hasLeaderMedicalNotes=true after sharing, got: {flags}"

    # Cleanup
    h1 = _elevated_headers(client, auth_headers, _USER_1_PWD)
    client.delete(f"{TRIP_ENDPOINT}/{trip_id}/member/me/medical-consent", headers=h1)
    h2 = _elevated_headers(client, auth_headers_2, _USER_2_PWD)
    client.delete(f"{TRIP_ENDPOINT}/{trip_id}/member/me/medical-consent", headers=h2)


def test_has_leader_medical_notes_false_before_sharing(client, auth_headers, trip_with_user2_as_crew):
    """hasLeaderMedicalNotes is false when no notes have been shared."""
    trip_id = trip_with_user2_as_crew["trip"]["id"]

    response = client.get(f"{TRIP_ENDPOINT}/{trip_id}", headers=auth_headers)
    assert response.status_code == 200
    travellers = json.loads(response.data)["travellers"]
    assert all(t.get("hasLeaderMedicalNotes") is False for t in travellers)

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

    client.delete(f"{TRIP_ENDPOINT}/{trip_id}", headers=auth_headers)
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

    client.delete(f"{TRIP_ENDPOINT}/{trip_id}", headers=auth_headers)
    client.patch(f"{USER_ENDPOINT}/{id}", json={
        "vesselMake": None, "vesselModel": None,
        "emergencyContactName": None, "emergencyContactPhone": None,
    }, headers=auth_headers)


# =============================================================================
# GET /api/trip/<id>/member/<member_id>/medical-notes  (leader fetches ECIES notes)
# =============================================================================

def _leader_keypair(client, auth_headers, password=_USER_1_PWD):
    """The leader's own wrapped private key, as their client fetches it."""
    response = client.get(
        f"{USER_ENDPOINT}/me/keypair", headers=_elevated_headers(client, auth_headers, password),
    )
    assert response.status_code == 200
    return json.loads(response.data)


def test_read_member_medical_notes_roundtrip(client, auth_headers, auth_headers_2, trip_with_user2_as_crew):
    """Leader can decrypt crew medical notes after the crew member shares them —
    entirely on the leader's side, with no password sent to the server."""
    trip_id = trip_with_user2_as_crew["trip"]["id"]
    crew_id = trip_with_user2_as_crew["crew_id"]

    # Crew saves and shares their notes
    _set_and_share_trip_notes(client, auth_headers_2, trip_id, _MEDICAL_NOTES_2, _USER_2_PWD)

    keypair = _leader_keypair(client, auth_headers)
    h = _elevated_headers(client, auth_headers)
    response = client.get(
        f"{TRIP_ENDPOINT}/{trip_id}/member/{crew_id}/medical-notes",
        headers=h,
    )
    assert response.status_code == 200
    sealed = json.loads(response.data)
    assert set(sealed) == {"ciphertext", "nonce", "ephemeralKey"}
    assert decrypt_as_recipient(
        sealed["ciphertext"],
        sealed["nonce"],
        sealed["ephemeralKey"],
        keypair["privateKeyCiphertext"],
        keypair["privateKeyNonce"],
        keypair["privateKeySalt"],
        _USER_1_PWD,
    ) == _MEDICAL_NOTES_2

    # Cleanup
    h2 = _elevated_headers(client, auth_headers_2, _USER_2_PWD)
    client.delete(f"{TRIP_ENDPOINT}/{trip_id}/member/me/medical-consent", headers=h2)


def test_read_member_medical_notes_no_notes_shared(client, auth_headers, trip_with_user2_as_crew):
    """Returns 404 when crew has not shared notes with the leader."""
    trip_id = trip_with_user2_as_crew["trip"]["id"]
    crew_id = trip_with_user2_as_crew["crew_id"]

    h = _elevated_headers(client, auth_headers)
    response = client.get(
        f"{TRIP_ENDPOINT}/{trip_id}/member/{crew_id}/medical-notes",
        headers=h,
    )
    assert response.status_code == 404


def test_read_member_medical_notes_is_useless_without_the_leader_password(
    client, auth_headers, auth_headers_2, trip_with_user2_as_crew
):
    """The server hands over ciphertext to an authenticated leader, and that is all it
    can do: the blob stays unreadable to anyone without the password that unwraps the
    leader's private key. This is the property that replaced the old 401-on-wrong-
    password, which only existed because the server did the decrypting."""
    trip_id = trip_with_user2_as_crew["trip"]["id"]
    crew_id = trip_with_user2_as_crew["crew_id"]

    _set_and_share_trip_notes(client, auth_headers_2, trip_id, _MEDICAL_NOTES_2, _USER_2_PWD)

    keypair = _leader_keypair(client, auth_headers)
    h = _elevated_headers(client, auth_headers)
    sealed = json.loads(client.get(
        f"{TRIP_ENDPOINT}/{trip_id}/member/{crew_id}/medical-notes", headers=h,
    ).data)
    assert _MEDICAL_NOTES_2 not in json.dumps(sealed)
    with pytest.raises(InvalidTag):
        decrypt_as_recipient(
            sealed["ciphertext"],
            sealed["nonce"],
            sealed["ephemeralKey"],
            keypair["privateKeyCiphertext"],
            keypair["privateKeyNonce"],
            keypair["privateKeySalt"],
            "wrongPassword1$",
        )

    # Cleanup
    h2 = _elevated_headers(client, auth_headers_2, _USER_2_PWD)
    client.delete(f"{TRIP_ENDPOINT}/{trip_id}/member/me/medical-consent", headers=h2)


def test_read_member_medical_notes_crew_forbidden(client, auth_headers_2, trip_with_user2_as_crew):
    """Crew members cannot read other members' notes via this endpoint."""
    trip_id = trip_with_user2_as_crew["trip"]["id"]
    crew_id = trip_with_user2_as_crew["crew_id"]

    h = _elevated_headers(client, auth_headers_2, _USER_2_PWD)
    response = client.get(
        f"{TRIP_ENDPOINT}/{trip_id}/member/{crew_id}/medical-notes",
        headers=h,
    )
    assert response.status_code == 403

    # The denial must be a true no-op — no access-log row for an unauthorized attempt.
    log_response = client.get(
        f"{TRIP_ENDPOINT}/{trip_id}/member/me/medical-notes/access-log", headers=auth_headers_2
    )
    assert json.loads(log_response.data) == []


def test_read_member_medical_notes_requires_elevated_token(client, auth_headers, auth_headers_2, trip_with_user2_as_crew):
    """Endpoint requires an elevated token, not just a regular JWT."""
    trip_id = trip_with_user2_as_crew["trip"]["id"]
    crew_id = trip_with_user2_as_crew["crew_id"]

    response = client.get(
        f"{TRIP_ENDPOINT}/{trip_id}/member/{crew_id}/medical-notes",
        headers=auth_headers,
    )
    assert response.status_code == 403

    # The denial must be a true no-op — no access-log row for a non-elevated attempt.
    log_response = client.get(
        f"{TRIP_ENDPOINT}/{trip_id}/member/me/medical-notes/access-log", headers=auth_headers_2
    )
    assert json.loads(log_response.data) == []


# =============================================================================
# GET /api/trip/<id>/member/me/medical-notes/access-log  (accountability record)
# =============================================================================

def test_leader_read_writes_an_access_log_row_the_crew_member_can_see(
    client, auth_headers, auth_headers_2, trip_with_user2_as_crew, id
):
    """A successful leader decrypt is recorded, and the crew member (whose notes they
    are) can see who read them and when."""
    trip_id = trip_with_user2_as_crew["trip"]["id"]
    crew_id = trip_with_user2_as_crew["crew_id"]

    _set_and_share_trip_notes(client, auth_headers_2, trip_id, _MEDICAL_NOTES_2, _USER_2_PWD)

    h = _elevated_headers(client, auth_headers)
    read_response = client.get(
        f"{TRIP_ENDPOINT}/{trip_id}/member/{crew_id}/medical-notes",
        headers=h,
    )
    assert read_response.status_code == 200

    log_response = client.get(
        f"{TRIP_ENDPOINT}/{trip_id}/member/me/medical-notes/access-log", headers=auth_headers_2
    )
    assert log_response.status_code == 200
    entries = json.loads(log_response.data)
    assert len(entries) == 1
    assert entries[0]["leader"]["id"] == str(id)
    assert "created" in entries[0]

    # Cleanup
    h2 = _elevated_headers(client, auth_headers_2, _USER_2_PWD)
    client.delete(f"{TRIP_ENDPOINT}/{trip_id}/member/me/medical-consent", headers=h2)


def test_access_log_empty_when_never_read(client, auth_headers_2, trip_with_user2_as_crew):
    """No access-log rows exist before the leader has ever read the crew member's notes."""
    trip_id = trip_with_user2_as_crew["trip"]["id"]

    response = client.get(
        f"{TRIP_ENDPOINT}/{trip_id}/member/me/medical-notes/access-log", headers=auth_headers_2
    )
    assert response.status_code == 200
    assert json.loads(response.data) == []


def test_access_log_not_written_when_nothing_was_shared(client, auth_headers, auth_headers_2, trip_with_user2_as_crew):
    """A leader who reaches for notes that were never shared gets a 404 and leaves no
    trace — the log records accesses, not attempts.

    Note what this test can no longer assert, and why. Before M22 a leader who typed
    the wrong password was rejected by the server's own decrypt and went unlogged.
    The decrypt now happens on the leader's device, so the server cannot tell a
    successful read from a failed one and logs the moment it hands the ciphertext
    over. That is deliberately over-inclusive: taking possession of a member's sealed
    notes is the access the member is entitled to see.
    """
    trip_id = trip_with_user2_as_crew["trip"]["id"]
    crew_id = trip_with_user2_as_crew["crew_id"]

    h = _elevated_headers(client, auth_headers)
    response = client.get(
        f"{TRIP_ENDPOINT}/{trip_id}/member/{crew_id}/medical-notes",
        headers=h,
    )
    assert response.status_code == 404

    log_response = client.get(
        f"{TRIP_ENDPOINT}/{trip_id}/member/me/medical-notes/access-log", headers=auth_headers_2
    )
    assert json.loads(log_response.data) == []


def test_access_log_not_visible_to_other_crew_members(client, auth_headers_2, trip_with_user2_as_crew):
    """A crew member cannot read another member's access log — it's scoped to 'me' only,
    there is no by-member-id variant of this endpoint."""
    trip_id = trip_with_user2_as_crew["trip"]["id"]
    crew_id = trip_with_user2_as_crew["crew_id"]

    response = client.get(
        f"{TRIP_ENDPOINT}/{trip_id}/member/{crew_id}/medical-notes/access-log", headers=auth_headers_2
    )
    assert response.status_code == 404
