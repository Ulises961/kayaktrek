"""HTTP-layer error branches for the user resource — validation, conflict,
auth, and not-found responses not exercised by 17_m3d_user_profile_test.py.

Rubric 1: Status codes are not assertions about behavior. When testing
updates, verify the actual DB state changed as expected.
"""
from uuid import UUID
from Api.database import db as _db
from Models.user import User
from Resources.user_resource import USER_ENDPOINT

_FAKE_UUID = "00000000-0000-7000-8000-0000000000dd"
_USER_PWD = "testPassword6$"


def _elevated_headers(client, auth_headers):
    r = client.post(f"{USER_ENDPOINT}/me/re-auth", headers=auth_headers,
                    json={"password": _USER_PWD})
    assert r.status_code == 200
    return {**auth_headers, "X-Elevated-Token": r.json["elevatedToken"]}


# ── PATCH /api/user/<id> ─────────────────────────────────────────────────────

def test_update_user_body_not_dict_returns_400(client, auth_headers, id):
    resp = client.patch(f"{USER_ENDPOINT}/{id}", headers=auth_headers, json=[1, 2, 3])
    assert resp.status_code == 400


def test_update_user_validation_error_returns_400(client, auth_headers, id):
    resp = client.patch(f"{USER_ENDPOINT}/{id}", headers=auth_headers,
                        json={"vesselLengthCm": "abc"})
    assert resp.status_code == 400


def test_update_user_duplicate_username_returns_409(client, auth_headers, id, user_2, app):
    # Get original username
    original = client.get(f"{USER_ENDPOINT}/me", headers=auth_headers).json
    original_username = original["username"]

    # Try to update to duplicate username
    resp = client.patch(f"{USER_ENDPOINT}/{id}", headers=auth_headers,
                        json={"username": user_2.username})
    assert resp.status_code == 409

    # Verify the username was NOT changed (rubric 1: assert behavior, not status)
    with app.app_context():
        user = _db.session.query(User).filter_by(id=UUID(id)).first()
        assert user.username == original_username, "Username should not change on 409 conflict"


def test_get_other_user_returns_403(client, auth_headers, id_2):
    """require_self forbids reading another user's full profile."""
    resp = client.get(f"{USER_ENDPOINT}/{id_2}", headers=auth_headers)
    assert resp.status_code == 403


# ── unit_preference ───────────────────────────────────────────────────────────

def test_unit_preference_defaults_to_nm(client, auth_headers, id):
    me = client.get(f"{USER_ENDPOINT}/me", headers=auth_headers).json
    assert me["unitPreference"] == "nm"


def test_update_unit_preference(client, auth_headers, id):
    resp = client.patch(f"{USER_ENDPOINT}/{id}", headers=auth_headers,
                        json={"unitPreference": "km"})
    assert resp.status_code == 200
    me = client.get(f"{USER_ENDPOINT}/me", headers=auth_headers).json
    assert me["unitPreference"] == "km"
    # Restore so the session-scoped user_1 carries no state into other tests.
    client.patch(f"{USER_ENDPOINT}/{id}", headers=auth_headers, json={"unitPreference": "nm"})


def test_update_unit_preference_invalid_value_returns_400(client, auth_headers, id):
    resp = client.patch(f"{USER_ENDPOINT}/{id}", headers=auth_headers,
                        json={"unitPreference": "miles"})
    assert resp.status_code == 400
    # Verify the invalid value was NOT saved (rubric 1: assert behavior, not status)
    me = client.get(f"{USER_ENDPOINT}/me", headers=auth_headers).json
    assert me["unitPreference"] in ("nm", "km")  # Only valid values


def test_unit_preference_not_leaked_by_unrelated_patch(client, auth_headers, id):
    """A PATCH omitting unitPreference must not silently reset it (partial-update contract)."""
    client.patch(f"{USER_ENDPOINT}/{id}", headers=auth_headers, json={"unitPreference": "km"})
    client.patch(f"{USER_ENDPOINT}/{id}", headers=auth_headers, json={"bio": "just a bio update"})
    me = client.get(f"{USER_ENDPOINT}/me", headers=auth_headers).json
    assert me["unitPreference"] == "km"
    # Restore.
    client.patch(f"{USER_ENDPOINT}/{id}", headers=auth_headers,
                 json={"unitPreference": "nm", "bio": None})


# ── PATCH public-profile fields + GET /api/user/<username>/public ────────────

def test_update_public_profile_fields(client, auth_headers, id):
    """bio / homeLocation / profileIsPublic are mutable via the profile PATCH path."""
    resp = client.patch(f"{USER_ENDPOINT}/{id}", headers=auth_headers,
                        json={"bio": "Sea kayaker", "homeLocation": "Wales", "profileIsPublic": True})
    assert resp.status_code == 200
    me = client.get(f"{USER_ENDPOINT}/me", headers=auth_headers).json
    assert me["bio"] == "Sea kayaker"
    assert me["homeLocation"] == "Wales"
    assert me["profileIsPublic"] is True
    # Restore so the session-scoped user_1 carries no public state into other tests.
    client.patch(f"{USER_ENDPOINT}/{id}", headers=auth_headers,
                 json={"profileIsPublic": False, "bio": None, "homeLocation": None})


def test_public_profile_missing_returns_404(client):
    resp = client.get(f"{USER_ENDPOINT}/no_such_paddler_xyz/public")
    assert resp.status_code == 404


def test_public_profile_private_returns_404(client, user_2):
    """user_2 is private by default — a single neutral 404, no existence oracle."""
    resp = client.get(f"{USER_ENDPOINT}/{user_2.username}/public")
    assert resp.status_code == 404


def test_public_profile_public_hides_private_fields(client, auth_headers_2, id_2, user_2):
    """A public profile is readable anonymously and leaks no private fields."""
    patch = client.patch(f"{USER_ENDPOINT}/{id_2}", headers=auth_headers_2,
                         json={"profileIsPublic": True, "bio": "Tidal paddler",
                               "homeLocation": "Pembrokeshire"})
    assert patch.status_code == 200
    try:
        resp = client.get(f"{USER_ENDPOINT}/{user_2.username}/public")  # no auth header
        assert resp.status_code == 200
        data = resp.json
        assert data["username"] == user_2.username
        assert data["bio"] == "Tidal paddler"
        assert data["homeLocation"] == "Pembrokeshire"
        assert "totalDistance" in data["stats"]
        for forbidden in ("mail", "phone", "vesselMake", "emergencyContactName",
                          "medicalNotesConsentAt", "admin", "deletionRequestedAt",
                          "logs", "endorsedLogs", "hasKeypair", "unitPreference"):
            assert forbidden not in data
    finally:
        client.patch(f"{USER_ENDPOINT}/{id_2}", headers=auth_headers_2,
                     json={"profileIsPublic": False, "bio": None, "homeLocation": None})


# ── PATCH /api/user/me/password ──────────────────────────────────────────────

def test_change_password_body_not_dict_returns_400(client, auth_headers):
    resp = client.patch(f"{USER_ENDPOINT}/me/password", headers=auth_headers, json="nope")
    assert resp.status_code == 400


# ── POST /api/user/me/re-auth ────────────────────────────────────────────────

def test_re_auth_missing_password_returns_400(client, auth_headers):
    resp = client.post(f"{USER_ENDPOINT}/me/re-auth", headers=auth_headers, json={})
    assert resp.status_code == 400


def test_re_auth_wrong_password_returns_401(client, auth_headers):
    resp = client.post(f"{USER_ENDPOINT}/me/re-auth", headers=auth_headers,
                       json={"password": "definitely-wrong"})
    assert resp.status_code == 401


# ── DELETE /api/user/me/deletion-request ─────────────────────────────────────

def test_cancel_deletion_invalid_token_returns_400(client):
    resp = client.delete(f"{USER_ENDPOINT}/me/deletion-request?token=not-a-real-token")
    assert resp.status_code == 400


def test_cancel_deletion_missing_token_returns_400(client):
    resp = client.delete(f"{USER_ENDPOINT}/me/deletion-request")
    assert resp.status_code == 400


# ── medical-consent / medical-notes (elevated token) validation ──────────────

def test_grant_medical_consent_body_not_dict_returns_400(client, auth_headers):
    headers = _elevated_headers(client, auth_headers)
    resp = client.post(f"{USER_ENDPOINT}/me/medical-consent", headers=headers, json="nope")
    assert resp.status_code == 400


def test_grant_medical_consent_missing_ciphertext_returns_400(client, auth_headers):
    headers = _elevated_headers(client, auth_headers)
    resp = client.post(f"{USER_ENDPOINT}/me/medical-consent", headers=headers,
                       json={"nonce": "bm9uY2U=", "salt": "c2FsdA=="})
    assert resp.status_code == 400


def test_grant_medical_consent_missing_salt_returns_400(client, auth_headers):
    headers = _elevated_headers(client, auth_headers)
    resp = client.post(f"{USER_ENDPOINT}/me/medical-consent", headers=headers,
                       json={"ciphertext": "Y3Q=", "nonce": "bm9uY2U="})
    assert resp.status_code == 400


def test_grant_medical_consent_empty_ciphertext_returns_400(client, auth_headers):
    """An empty string is present-but-useless — storing it would record consent
    against a note that can never be decrypted back into anything."""
    headers = _elevated_headers(client, auth_headers)
    resp = client.post(f"{USER_ENDPOINT}/me/medical-consent", headers=headers,
                       json={"ciphertext": "", "nonce": "bm9uY2U=", "salt": "c2FsdA=="})
    assert resp.status_code == 400


def test_medical_consent_without_elevated_token_returns_403(client, auth_headers):
    resp = client.post(f"{USER_ENDPOINT}/me/medical-consent", headers=auth_headers,
                       json={"ciphertext": "Y3Q=", "nonce": "bm9uY2U=", "salt": "c2FsdA=="})
    assert resp.status_code == 403


# ── DELETE /api/user/<id> (admin) ────────────────────────────────────────────

def test_delete_user_as_non_admin_returns_403(client, auth_headers):
    """require_admin guards hard-delete; a non-admin caller is forbidden."""
    resp = client.delete(f"{USER_ENDPOINT}/{_FAKE_UUID}", headers=auth_headers)
    assert resp.status_code == 403
