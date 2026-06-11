import json
from uuid import UUID

import pytest

from Api.database import db as _db
from Models.user import User
from Resources.user_resource import USER_ENDPOINT
from Services.Middleware.auth_middleware import JWTService

_USER_PWD = "testPassword6$"
_NEW_PWD = "newPassword7$"
_MEDICAL_NOTES = "Allergic to penicillin. Blood type A+."


@pytest.fixture(scope="function")
def pw_user(app, client):
    """
    Throwaway user for password-change tests.
    Session-scoped users (user_1/user_2) must never have their passwords changed
    because stamping password_changed_at invalidates the session auth token.
    """
    data = {
        "mail": "pwchange.tmp@example.com",
        "pwd": _USER_PWD,
        "phone": "+39099900003",
        "name": "PwChange",
        "username": "pwchange_tmp",
    }
    client.post("/api/auth/register", json=data)
    with app.app_context():
        user = User.query.filter_by(mail="pwchange.tmp@example.com").first()
        user.active = True
        _db.session.commit()
        token = JWTService.generate_access_token(str(user.id), user.mail, user.admin, user.token_version)
        user_id = str(user.id)
    yield {"Authorization": f"Bearer {token}"}
    with app.app_context():
        u = _db.session.query(User).filter_by(id=UUID(user_id)).first()
        if u:
            _db.session.delete(u)
            _db.session.commit()


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


def test_change_password_success(client, pw_user):
    """Uses a throwaway user — changing password stamps password_changed_at,
    which would invalidate the session-scoped auth_headers token."""
    response = client.patch(
        f"{USER_ENDPOINT}/me/password",
        json={"currentPwd": _USER_PWD, "newPwd": _NEW_PWD},
        headers=pw_user,
    )
    assert response.status_code == 204
    # No restore needed — the fixture cleans up the user entirely.


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
# POST /api/user/me/medical-notes
# =============================================================================

def test_get_medical_notes_requires_elevated_token(client, auth_headers):
    response = client.post(
        f"{USER_ENDPOINT}/me/medical-notes",
        json={"password": _USER_PWD},
        headers=auth_headers,
    )
    assert response.status_code == 403


def test_get_medical_notes_success(client, auth_headers):
    headers = _elevated_headers(client, auth_headers)
    client.post(
        f"{USER_ENDPOINT}/me/medical-consent",
        json={"medicalNotes": _MEDICAL_NOTES, "password": _USER_PWD},
        headers=headers,
    )
    headers = _elevated_headers(client, auth_headers)
    response = client.post(
        f"{USER_ENDPOINT}/me/medical-notes",
        json={"password": _USER_PWD},
        headers=headers,
    )
    assert response.status_code == 200
    assert json.loads(response.data)["medicalNotes"] == _MEDICAL_NOTES


def test_get_medical_notes_wrong_password(client, auth_headers):
    headers = _elevated_headers(client, auth_headers)
    response = client.post(
        f"{USER_ENDPOINT}/me/medical-notes",
        json={"password": "wrongPassword1$"},
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
