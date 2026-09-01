import json
import time
from uuid import UUID

import pytest

from Api.database import db as _db
from Models.user import User
from Resources.user_resource import USER_ENDPOINT
from Services.Middleware.auth_middleware import JWTService
from Services.crypto_service import decrypt, encrypt
from Tests.auth_helpers import access_token_for
from Tests.conftest import _keypair_fields

_USER_PWD = "testPassword6$"
_NEW_PWD = "newPassword7$"
_MEDICAL_NOTES = "Allergic to penicillin. Blood type A+."


def _sealed(plaintext=_MEDICAL_NOTES, password=_USER_PWD):
    """Seal notes the way the client does since M22.

    Uses crypto_service — the same code that produced every ciphertext already in the
    database — so a round trip through these endpoints also demonstrates that no
    migration is needed: the server stores and returns the blob untouched.
    """
    ciphertext, nonce, salt = encrypt(plaintext, password)
    return {"ciphertext": ciphertext, "nonce": nonce, "salt": salt}


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
    client.post("/api/v1/auth/register", json=data)
    with app.app_context():
        user = User.query.filter_by(mail="pwchange.tmp@example.com").first()
        user.active = True
        _db.session.commit()
        token = access_token_for(user)
        user_id = str(user.id)
    yield {"Authorization": f"Bearer {token}"}
    with app.app_context():
        u = _db.session.query(User).filter_by(id=UUID(user_id)).first()
        if u:
            _db.session.delete(u)
            _db.session.commit()


@pytest.fixture(scope="function")
def pw_user_with_keypair(app, client):
    """Throwaway user with a medical-notes keypair, for password-change rewrap tests.

    Mirrors pw_user but registers with a keypair (as the web client does since M22) so the
    rewrap-on-change path has something to exercise.
    """
    data = {
        "mail": "pwchange.keypair.tmp@example.com",
        "pwd": _USER_PWD,
        "phone": "+39099900004",
        "name": "PwChangeKeypair",
        "username": "pwchange_keypair_tmp",
        **_keypair_fields(_USER_PWD),
    }
    client.post("/api/v1/auth/register", json=data)
    with app.app_context():
        user = User.query.filter_by(mail="pwchange.keypair.tmp@example.com").first()
        user.active = True
        _db.session.commit()
        token = access_token_for(user)
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


def test_change_password_missing_rewrap_when_keypair_exists(client, pw_user_with_keypair):
    """A keypair must never be silently orphaned: changing the password without supplying
    the rewrapped private key is rejected rather than leaving the key wrapped under a
    password that no longer works (M22 — the server no longer rewraps it itself)."""
    response = client.patch(
        f"{USER_ENDPOINT}/me/password",
        json={"currentPwd": _USER_PWD, "newPwd": _NEW_PWD},
        headers=pw_user_with_keypair,
    )
    assert response.status_code == 400


def test_change_password_rewraps_private_key(app, client, pw_user_with_keypair):
    """The client rewraps the private key locally and posts ciphertext only (M22). Proves
    the server stores it verbatim: the key unwraps under the new password afterwards and
    no longer unwraps under the old one — the no-migration guarantee for this path."""
    elevated = _elevated_headers(client, pw_user_with_keypair)
    current = json.loads(client.get(f"{USER_ENDPOINT}/me/keypair", headers=elevated).data)
    private_key_b64 = decrypt(
        current["privateKeyCiphertext"],
        current["privateKeyNonce"],
        current["privateKeySalt"],
        _USER_PWD,
    )
    new_ct, new_nonce, new_salt = encrypt(private_key_b64, _NEW_PWD)

    response = client.patch(
        f"{USER_ENDPOINT}/me/password",
        json={
            "currentPwd": _USER_PWD,
            "newPwd": _NEW_PWD,
            "privateKeyCiphertext": new_ct,
            "privateKeyNonce": new_nonce,
            "privateKeySalt": new_salt,
        },
        headers=pw_user_with_keypair,
    )
    assert response.status_code == 204

    # password_changed_at bumped token_version, so the bearer token above is now dead —
    # mint a fresh one exactly like a real re-login would produce. The password-change
    # guard rejects a token whose `iat` (JWT truncates to whole seconds) reads earlier
    # than password_changed_at (sub-second precision); a real login is never this fast
    # after the request that set it, but a test can be, so cross the second boundary.
    time.sleep(1)
    with app.app_context():
        user = User.query.filter_by(mail="pwchange.keypair.tmp@example.com").first()
        fresh_headers = {"Authorization": f"Bearer {access_token_for(user)}"}

    reauth_new = client.post(
        f"{USER_ENDPOINT}/me/re-auth", json={"password": _NEW_PWD}, headers=fresh_headers,
    )
    assert reauth_new.status_code == 200
    elevated_new = {
        **fresh_headers,
        "X-Elevated-Token": json.loads(reauth_new.data)["elevatedToken"],
    }
    stored = json.loads(client.get(f"{USER_ENDPOINT}/me/keypair", headers=elevated_new).data)
    assert stored["privateKeyCiphertext"] == new_ct
    assert (
        decrypt(
            stored["privateKeyCiphertext"], stored["privateKeyNonce"], stored["privateKeySalt"],
            _NEW_PWD,
        )
        == private_key_b64
    )

    # The old password no longer re-authenticates at all, so there's nothing to unwrap
    # with it — this is what "no server-side rewrap of a plaintext password" now means.
    reauth_old = client.post(
        f"{USER_ENDPOINT}/me/re-auth", json={"password": _USER_PWD}, headers=fresh_headers,
    )
    assert reauth_old.status_code == 401


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
        json=_sealed(),
        headers=auth_headers,
    )
    assert response.status_code == 403


def test_grant_medical_consent_success(client, auth_headers):
    headers = _elevated_headers(client, auth_headers)
    response = client.post(
        f"{USER_ENDPOINT}/me/medical-consent",
        json=_sealed(),
        headers=headers,
    )
    assert response.status_code == 200
    data = json.loads(response.data)
    assert data["medicalNotesConsentAt"] is not None
    # Ciphertext must never be exposed
    assert "medicalNotesCiphertext" not in data
    assert "medicalNotesNonce" not in data
    assert "medicalNotesSalt" not in data


def test_grant_medical_consent_rejects_plaintext_body(client, auth_headers):
    """The pre-M22 body shape must fail loudly rather than storing a plaintext note
    under a field that everything downstream will try to decrypt."""
    headers = _elevated_headers(client, auth_headers)
    response = client.post(
        f"{USER_ENDPOINT}/me/medical-consent",
        json={"medicalNotes": _MEDICAL_NOTES, "password": _USER_PWD},
        headers=headers,
    )
    assert response.status_code == 400


# =============================================================================
# GET /api/user/me/medical-notes
# =============================================================================

def test_get_medical_notes_requires_elevated_token(client, auth_headers):
    response = client.get(
        f"{USER_ENDPOINT}/me/medical-notes",
        headers=auth_headers,
    )
    assert response.status_code == 403


def test_get_medical_notes_returns_the_stored_blob_verbatim(client, auth_headers):
    sealed = _sealed()
    headers = _elevated_headers(client, auth_headers)
    client.post(f"{USER_ENDPOINT}/me/medical-consent", json=sealed, headers=headers)

    headers = _elevated_headers(client, auth_headers)
    response = client.get(f"{USER_ENDPOINT}/me/medical-notes", headers=headers)
    assert response.status_code == 200
    data = json.loads(response.data)
    assert data == sealed
    # The server is a store, not a decryptor — the notes only exist once the caller
    # supplies the password, which it never sent.
    assert decrypt(data["ciphertext"], data["nonce"], data["salt"], _USER_PWD) == _MEDICAL_NOTES


def test_get_medical_notes_none_stored_returns_nulls(client, auth_headers):
    headers = _elevated_headers(client, auth_headers)
    client.delete(f"{USER_ENDPOINT}/me/medical-consent", headers=headers)

    headers = _elevated_headers(client, auth_headers)
    response = client.get(f"{USER_ENDPOINT}/me/medical-notes", headers=headers)
    assert response.status_code == 200
    assert json.loads(response.data) == {"ciphertext": None, "nonce": None, "salt": None}


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


# =============================================================================
# medical_notes_reset_at flag lifecycle (security review remediation)
# =============================================================================

def test_medical_notes_reset_flag_after_password_reset(client, pw_user, app):
    """Password reset sets medical_notes_reset_at flag (security fix).

    When a password is reset, medical notes are potentially compromised (the
    old password may have been leaked), so the flag is set to prompt the
    user to re-grant consent.
    """
    # First, grant consent on our throwaway user
    headers = _elevated_headers(client, pw_user, password=_USER_PWD)
    client.post(
        f"{USER_ENDPOINT}/me/medical-consent",
        json=_sealed(),
        headers=headers,
    )

    # Verify the flag is initially None
    response = client.get(f"{USER_ENDPOINT}/me", headers=pw_user)
    data = json.loads(response.data)
    assert data["medicalNotesResetAt"] is None

    # Now change password
    response = client.patch(
        f"{USER_ENDPOINT}/me/password",
        json={"currentPwd": _USER_PWD, "newPwd": _NEW_PWD},
        headers=pw_user,
    )
    assert response.status_code == 204

    # After password change, verify via DB that the flag WAS set
    # (the old token is now invalid, so we can't use it for requests)
    with app.app_context():
        user = _db.session.query(User).filter_by(mail="pwchange.tmp@example.com").first()
        assert user is not None, "Test user should exist"
        assert user.medical_notes_reset_at is not None, \
            "medical_notes_reset_at should be set after password reset when user has medical notes"


def test_medical_notes_reset_flag_cleared_on_re_consent(client, pw_user, app):
    """Re-granting consent clears the medical_notes_reset_at flag.

    When user re-consents to store medical notes after a password reset,
    the flag is cleared to indicate they've acknowledged the situation.
    Uses pw_user (function-scoped throwaway) instead of session-scoped user_1.
    """
    # Manually set the flag on the pw_user (simulating a password reset)
    from datetime import datetime, timezone
    with app.app_context():
        user = _db.session.query(User).filter_by(mail="pwchange.tmp@example.com").first()
        assert user is not None
        user.medical_notes_reset_at = datetime.now(timezone.utc)
        _db.session.commit()

    # Verify the flag was set via DB query
    with app.app_context():
        user = _db.session.query(User).filter_by(mail="pwchange.tmp@example.com").first()
        assert user.medical_notes_reset_at is not None, "Flag should be set in DB after manual setting"

    # Re-grant consent
    headers = _elevated_headers(client, pw_user)
    response = client.post(
        f"{USER_ENDPOINT}/me/medical-consent",
        json=_sealed(),
        headers=headers,
    )
    assert response.status_code == 200, f"POST /medical-consent failed: {response.status_code} {response.data}"

    # Verify the flag is now cleared via DB query
    with app.app_context():
        user = _db.session.query(User).filter_by(mail="pwchange.tmp@example.com").first()
        assert user is not None
        assert user.medical_notes_reset_at is None, \
            f"medical_notes_reset_at should be cleared after re-granting consent, but was {user.medical_notes_reset_at}"
