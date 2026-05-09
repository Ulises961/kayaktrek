import json

from Resources.user_resource import USER_ENDPOINT

_USER_PWD = "testPassword6$"
_NEW_PWD = "newPassword7$"
_MEDICAL_NOTES = "Allergic to penicillin. Blood type A+."


def _elevated_headers(client, auth_headers, password=_USER_PWD):
    r = client.post(
        f"{USER_ENDPOINT}/me/re-auth",
        json={"password": password},
        headers=auth_headers,
    )
    assert r.status_code == 200
    token = json.loads(r.data)["elevatedToken"]
    return {**auth_headers, "X-Elevated-Token": token}


# =============================================================================
# PATCH /api/user/me/password
# =============================================================================

def test_change_password_requires_auth(client):
    response = client.patch(f"{USER_ENDPOINT}/me/password", json={})
    assert response.status_code in (401, 403)


def test_change_password_missing_fields(client, auth_headers):
    response = client.patch(
        f"{USER_ENDPOINT}/me/password",
        json={"currentPwd": _USER_PWD},
        headers=auth_headers,
    )
    assert response.status_code == 400


def test_change_password_wrong_current_pwd(client, auth_headers):
    response = client.patch(
        f"{USER_ENDPOINT}/me/password",
        json={"currentPwd": "wrongPassword1$", "newPwd": _NEW_PWD},
        headers=auth_headers,
    )
    assert response.status_code == 400


def test_change_password_success(client, auth_headers):
    response = client.patch(
        f"{USER_ENDPOINT}/me/password",
        json={"currentPwd": _USER_PWD, "newPwd": _NEW_PWD},
        headers=auth_headers,
    )
    assert response.status_code == 204

    # Restore original password so subsequent tests are unaffected
    client.patch(
        f"{USER_ENDPOINT}/me/password",
        json={"currentPwd": _NEW_PWD, "newPwd": _USER_PWD},
        headers=auth_headers,
    )


# =============================================================================
# POST /api/user/me/re-auth
# =============================================================================

def test_re_auth_requires_auth(client):
    response = client.post(
        f"{USER_ENDPOINT}/me/re-auth", json={"password": _USER_PWD}
    )
    assert response.status_code in (401, 403)


def test_re_auth_wrong_password_rejected(client, auth_headers):
    response = client.post(
        f"{USER_ENDPOINT}/me/re-auth",
        json={"password": "wrongPassword1$"},
        headers=auth_headers,
    )
    assert response.status_code == 401


def test_re_auth_returns_elevated_token(client, auth_headers):
    response = client.post(
        f"{USER_ENDPOINT}/me/re-auth",
        json={"password": _USER_PWD},
        headers=auth_headers,
    )
    assert response.status_code == 200
    assert "elevatedToken" in json.loads(response.data)


# =============================================================================
# POST /api/user/me/medical-consent
# =============================================================================

def test_grant_medical_consent_requires_elevated_token(client, auth_headers):
    response = client.post(
        f"{USER_ENDPOINT}/me/medical-consent",
        json={"medicalNotes": _MEDICAL_NOTES, "password": _USER_PWD},
        headers=auth_headers,
    )
    assert response.status_code == 403


def test_grant_medical_consent_success(client, auth_headers):
    headers = _elevated_headers(client, auth_headers)
    response = client.post(
        f"{USER_ENDPOINT}/me/medical-consent",
        json={"medicalNotes": _MEDICAL_NOTES, "password": _USER_PWD},
        headers=headers,
    )
    assert response.status_code == 200
    data = json.loads(response.data)
    assert data["medicalNotesConsentAt"] is not None
    # Ciphertext must never be exposed
    assert "medicalNotesCiphertext" not in data
    assert "medicalNotesNonce" not in data
    assert "medicalNotesSalt" not in data


# =============================================================================
# GET /api/user/me/medical-notes
# =============================================================================

def test_get_medical_notes_requires_elevated_token(client, auth_headers):
    response = client.get(
        f"{USER_ENDPOINT}/me/medical-notes?password={_USER_PWD}",
        headers=auth_headers,
    )
    assert response.status_code == 403


def test_get_medical_notes_success(client, auth_headers):
    headers = _elevated_headers(client, auth_headers)
    response = client.get(
        f"{USER_ENDPOINT}/me/medical-notes?password={_USER_PWD}",
        headers=headers,
    )
    assert response.status_code == 200
    assert json.loads(response.data)["medicalNotes"] == _MEDICAL_NOTES


def test_get_medical_notes_wrong_password(client, auth_headers):
    headers = _elevated_headers(client, auth_headers)
    response = client.get(
        f"{USER_ENDPOINT}/me/medical-notes?password=wrongPassword1$",
        headers=headers,
    )
    assert response.status_code in (400, 401)


# =============================================================================
# DELETE /api/user/me/medical-consent
# =============================================================================

def test_revoke_medical_consent_requires_elevated_token(client, auth_headers):
    response = client.delete(
        f"{USER_ENDPOINT}/me/medical-consent", headers=auth_headers
    )
    assert response.status_code == 403


def test_revoke_medical_consent_success(client, auth_headers):
    headers = _elevated_headers(client, auth_headers)
    response = client.delete(f"{USER_ENDPOINT}/me/medical-consent", headers=headers)
    assert response.status_code == 204


def test_after_revoke_consent_at_is_null(client, auth_headers):
    response = client.get(f"{USER_ENDPOINT}/me", headers=auth_headers)
    data = json.loads(response.data)
    assert data["medicalNotesConsentAt"] is None
