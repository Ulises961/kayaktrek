"""
M17 — per-device sessions, family-scoped revocation, and the instant-revocation denylist.

Every fixture here builds a *multi-device* state on purpose: single-session fixtures are
exactly what hid the limitation this milestone exists to fix, so each revocation test
asserts both what was ended and what was left alone.

The denylist is faked rather than pointed at a live Redis (the shared `denylist` fixture,
conftest.py) — CI runs no Redis service and the service fails open, so a real-Redis test
would silently assert nothing there.
"""
import os
from unittest.mock import patch
from uuid import UUID

import pytest
from flask import request
from redis.exceptions import RedisError

from Api.database import db
from Models.session import Session
from Models.user import User
from Resources.session_resource import SESSION_ENDPOINT
from Resources.user_resource import USER_ENDPOINT
from Services.session_service import SessionService
from Services.Middleware.auth_middleware import JWTService
from Services.Utils.client_identity import resolve_device_label, resolve_location_label

_PROTECTED = f"{USER_ENDPOINT}/me"
_PWD = "SessionAuth9$"


@pytest.fixture(scope="function")
def paddler(app, client):
    """A registered, active user with no sessions yet."""
    mail = "m17.paddler@example.com"
    response = client.post("/api/v1/auth/register", json={
        "mail": mail,
        "pwd": _PWD,
        "phone": "+39099944401",
        "name": "Session",
        "username": "m17_paddler",
    })
    assert response.status_code == 201
    with app.app_context():
        user = User.query.filter_by(mail=mail).first()
        user.active = True
        db.session.commit()
        user_id = str(user.id)

    yield {"id": user_id, "mail": mail}

    with app.app_context():
        user = db.session.query(User).filter_by(id=UUID(user_id)).first()
        if user:
            db.session.delete(user)
            db.session.commit()


def _login(client, paddler, user_agent="Mozilla/5.0 (X11; Linux x86_64) Firefox/130.0"):
    """Log in as one device, returning its token pair."""
    response = client.post(
        "/api/v1/auth/login",
        json={"mail": paddler["mail"], "pwd": _PWD},
        headers={"User-Agent": user_agent},
    )
    assert response.status_code == 200, response.data
    body = response.get_json()
    return body["access_token"], body["refresh_token"]


def _bearer(token):
    return {"Authorization": f"Bearer {token}"}


def _refresh(client, refresh_token):
    return client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})


def _sid(app, token):
    with app.app_context():
        return JWTService.decode_token(token)["sid"]


# =============================================================================
# Session creation
# =============================================================================

def test_login_opens_a_session_and_stamps_it_on_the_token(app, client, paddler, denylist):
    access_token, refresh_token = _login(client, paddler)

    with app.app_context():
        access_claims = JWTService.decode_token(access_token)
        refresh_claims = JWTService.decode_token(refresh_token)
        assert access_claims["sid"] == refresh_claims["sid"]

        session = db.session.get(Session, UUID(access_claims["sid"]))
        assert session is not None
        assert str(session.user_id) == paddler["id"]
        assert session.device_label == "Firefox on Linux"
        assert refresh_claims["rtv"] == session.token_version


def test_each_login_is_its_own_session(app, client, paddler, denylist):
    laptop_access, _ = _login(client, paddler)
    phone_access, _ = _login(client, paddler, user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) Safari/605.1")

    assert _sid(app, laptop_access) != _sid(app, phone_access)
    with app.app_context():
        sessions = SessionService.list_for_user(UUID(paddler["id"]))
        assert {session.device_label for session in sessions} == {"Firefox on Linux", "iPhone"}


# =============================================================================
# Refresh and reuse detection
# =============================================================================

def test_refresh_rotates_only_its_own_session(app, client, paddler, denylist):
    _, laptop_refresh = _login(client, paddler)
    _, phone_refresh = _login(client, paddler, user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) Safari/605.1")
    laptop_sid, phone_sid = _sid(app, laptop_refresh), _sid(app, phone_refresh)

    assert _refresh(client, laptop_refresh).status_code == 200

    with app.app_context():
        assert db.session.get(Session, UUID(laptop_sid)).token_version == 1
        assert db.session.get(Session, UUID(phone_sid)).token_version == 0

    # The device that never refreshed can still refresh with its original token.
    assert _refresh(client, phone_refresh).status_code == 200


def test_reuse_revokes_only_the_offending_family(app, client, paddler, denylist):
    laptop_access, laptop_refresh = _login(client, paddler)
    phone_access, phone_refresh = _login(client, paddler, user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) Safari/605.1")
    laptop_sid, phone_sid = _sid(app, laptop_refresh), _sid(app, phone_refresh)

    assert _refresh(client, laptop_refresh).status_code == 200

    # Replaying the already-exchanged token is the theft signal.
    replayed = _refresh(client, laptop_refresh)
    assert replayed.status_code == 401
    assert "reuse" in replayed.get_json()["message"]

    with app.app_context():
        assert db.session.get(Session, UUID(laptop_sid)).revoked_at is not None
        assert db.session.get(Session, UUID(phone_sid)).revoked_at is None
    assert f"revoked:{laptop_sid}" in denylist.keys
    assert f"revoked:{phone_sid}" not in denylist.keys

    # The other device is untouched: its access token still works and it can still refresh.
    assert client.get(_PROTECTED, headers=_bearer(phone_access)).status_code == 200
    assert _refresh(client, phone_refresh).status_code == 200
    # ...while the compromised device is locked out on both token types.
    assert client.get(_PROTECTED, headers=_bearer(laptop_access)).status_code == 401


def test_refresh_after_revocation_is_refused(app, client, paddler, denylist):
    _, refresh_token = _login(client, paddler)
    session_id = _sid(app, refresh_token)

    with app.app_context():
        session = db.session.get(Session, UUID(session_id))
        SessionService.revoke(session, reason="test")

    assert _refresh(client, refresh_token).status_code == 401


# =============================================================================
# Instant revocation
# =============================================================================

def test_revoked_session_is_rejected_on_the_very_next_request(app, client, paddler, denylist):
    access_token, refresh_token = _login(client, paddler)
    session_id = _sid(app, access_token)
    assert client.get(_PROTECTED, headers=_bearer(access_token)).status_code == 200

    response = client.delete(f"{SESSION_ENDPOINT}/{session_id}", headers=_bearer(access_token))
    assert response.status_code == 200

    # Same unexpired token, next request — the denylist is what stops it, since nothing
    # about the token itself changed.
    assert client.get(_PROTECTED, headers=_bearer(access_token)).status_code == 401
    assert _refresh(client, refresh_token).status_code == 401


def test_logout_ends_only_the_calling_device(app, client, paddler, denylist):
    laptop_access, _ = _login(client, paddler)
    phone_access, phone_refresh = _login(client, paddler, user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) Safari/605.1")

    assert client.post("/api/v1/auth/logout", headers=_bearer(laptop_access)).status_code == 200

    assert client.get(_PROTECTED, headers=_bearer(laptop_access)).status_code == 401
    assert client.get(_PROTECTED, headers=_bearer(phone_access)).status_code == 200
    assert _refresh(client, phone_refresh).status_code == 200


def test_sign_out_everywhere_leaves_no_usable_session(app, client, paddler, denylist):
    laptop_access, laptop_refresh = _login(client, paddler)
    phone_access, phone_refresh = _login(client, paddler, user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) Safari/605.1")

    assert client.post("/api/v1/auth/logout-all", headers=_bearer(laptop_access)).status_code == 200

    with app.app_context():
        assert SessionService.list_for_user(UUID(paddler["id"])) == []
        assert all(
            session.revoked_at is not None
            for session in db.session.query(Session).filter_by(user_id=UUID(paddler["id"])).all()
        )
    for token in (laptop_access, phone_access):
        assert client.get(_PROTECTED, headers=_bearer(token)).status_code == 401
    for token in (laptop_refresh, phone_refresh):
        assert _refresh(client, token).status_code == 401


def test_password_change_revokes_every_session(app, client, paddler, denylist):
    laptop_access, _ = _login(client, paddler)
    phone_access, _ = _login(client, paddler, user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) Safari/605.1")
    phone_sid = _sid(app, phone_access)

    response = client.patch(
        f"{USER_ENDPOINT}/me/password",
        json={"currentPwd": _PWD, "newPwd": "ChangedPass9$"},
        headers=_bearer(laptop_access),
    )
    assert response.status_code == 204

    with app.app_context():
        assert SessionService.list_for_user(UUID(paddler["id"])) == []
    assert f"revoked:{phone_sid}" in denylist.keys
    assert client.get(_PROTECTED, headers=_bearer(phone_access)).status_code == 401


# =============================================================================
# Denylist behaviour under failure
# =============================================================================

def test_denylist_fails_open_when_redis_is_unreachable(app, client, paddler, denylist):
    """A Redis outage must not log the whole platform out.

    The revoked session still cannot refresh — that check is in Postgres — so the
    exposure is bounded by the access token's own expiry, which is the pre-M17 behaviour.
    """
    access_token, refresh_token = _login(client, paddler)
    session_id = _sid(app, access_token)

    with app.app_context():
        SessionService.revoke(db.session.get(Session, UUID(session_id)), reason="test")
        assert db.session.get(Session, UUID(session_id)).revoked_at is not None

    denylist.down = True

    assert client.get(_PROTECTED, headers=_bearer(access_token)).status_code == 200
    assert _refresh(client, refresh_token).status_code == 401


@pytest.mark.parametrize("failure", [
    RedisError("connection refused"),
    ValueError("Redis URL must specify one of the following schemes"),
    OSError("socket is dead"),
])
def test_denylist_fails_open_on_any_client_failure(app, client, paddler, denylist, failure):
    """Not every way Redis can be unavailable is a RedisError — a misconfigured URL raises
    ValueError from the client constructor. The denylist is an optimisation over the access
    token's own expiry, so nothing it can do may turn into a failed request."""
    access_token, _ = _login(client, paddler)
    denylist.down = True
    denylist.failure = failure

    assert client.get(_PROTECTED, headers=_bearer(access_token)).status_code == 200


def test_revocation_survives_a_failed_denylist_write(app, client, paddler, denylist):
    """If the denylist write fails, the row must still be revoked — the outage may not
    leave a session that can go on refreshing itself forever."""
    _, refresh_token = _login(client, paddler)
    session_id = _sid(app, refresh_token)

    denylist.down = True
    with app.app_context():
        SessionService.revoke(db.session.get(Session, UUID(session_id)), reason="test")
        assert db.session.get(Session, UUID(session_id)).revoked_at is not None

    denylist.down = False
    assert _refresh(client, refresh_token).status_code == 401


# =============================================================================
# Sessions list
# =============================================================================

def test_sessions_list_marks_the_calling_device(app, client, paddler, denylist):
    laptop_access, _ = _login(client, paddler)
    _login(client, paddler, user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) Safari/605.1")

    response = client.get(f"{SESSION_ENDPOINT}/all", headers=_bearer(laptop_access))
    assert response.status_code == 200
    sessions = response.get_json()

    assert len(sessions) == 2
    current = [session for session in sessions if session["isCurrent"]]
    assert len(current) == 1
    assert current[0]["deviceLabel"] == "Firefox on Linux"
    assert current[0]["id"] == _sid(app, laptop_access)
    # Rotation state is not the user's business and must not leak into the projection.
    assert "tokenVersion" not in sessions[0]


def test_revoked_sessions_drop_out_of_the_list(app, client, paddler, denylist):
    laptop_access, _ = _login(client, paddler)
    phone_access, _ = _login(client, paddler, user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) Safari/605.1")
    phone_sid = _sid(app, phone_access)

    assert client.delete(f"{SESSION_ENDPOINT}/{phone_sid}", headers=_bearer(laptop_access)).status_code == 200

    remaining = client.get(f"{SESSION_ENDPOINT}/all", headers=_bearer(laptop_access)).get_json()
    assert [session["id"] for session in remaining] == [_sid(app, laptop_access)]


def test_cannot_revoke_another_users_session(app, client, paddler, denylist, auth_headers, user_1):
    _, refresh_token = _login(client, paddler)
    victim_sid = _sid(app, refresh_token)

    response = client.delete(f"{SESSION_ENDPOINT}/{victim_sid}", headers=auth_headers)
    assert response.status_code == 404

    with app.app_context():
        assert db.session.get(Session, UUID(victim_sid)).revoked_at is None


def test_sessions_list_is_scoped_to_the_caller(app, client, paddler, denylist, auth_headers):
    _login(client, paddler)

    other_sessions = client.get(f"{SESSION_ENDPOINT}/all", headers=auth_headers).get_json()
    assert paddler["id"] not in [session.get("userId") for session in other_sessions]
    assert all("userId" not in session for session in other_sessions)


# =============================================================================
# Device and location labels
# =============================================================================

@pytest.mark.parametrize("user_agent,expected", [
    ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131.0 Safari/537.36", "Chrome on macOS"),
    ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36 Edg/131.0", "Edge on Windows"),
    ("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1 Safari/604.1", "iPhone"),
    ("Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1 Safari/604.1", "iPad"),
    ("Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36", "Chrome on Android"),
    ("KayakPlanner/1.0", None),
    ("", None),
    (None, None),
])
def test_device_label_is_coarse(app, user_agent, expected):
    assert resolve_device_label(user_agent) == expected


def _location_for(app, headers, trusted_hops="1"):
    with patch.dict(os.environ, {"PROXY_TRUSTED_HOPS": trusted_hops}):
        with app.test_request_context("/", headers=headers):
            return resolve_location_label()


def test_location_label_is_built_from_the_cloudflare_headers(app):
    label = _location_for(app, {
        "CF-IPCity": "Genoa",
        "CF-Region": "Liguria",
        "CF-IPCountry": "IT",
    })
    assert label == "Genoa, Liguria, Italy"


def test_location_label_falls_back_to_what_is_available(app):
    assert _location_for(app, {"CF-IPCountry": "BR"}) == "Brazil"
    assert _location_for(app, {"CF-IPCity": "Genoa", "CF-IPCountry": "IT"}) == "Genoa, Italy"
    # Cloudflare has shipped the region under both header names.
    assert _location_for(app, {"CF-IPRegion": "Liguria", "CF-IPCountry": "IT"}) == "Liguria, Italy"


def test_location_label_does_not_repeat_itself(app):
    label = _location_for(app, {
        "CF-IPCity": "Singapore",
        "CF-Region": "Singapore",
        "CF-IPCountry": "SG",
    })
    assert label == "Singapore"


def test_location_label_is_none_without_headers(app):
    assert _location_for(app, {}) is None
    # Cloudflare's own placeholders for "could not locate" must not become a label.
    assert _location_for(app, {"CF-IPCountry": "XX"}) is None


def test_location_headers_are_ignored_when_not_behind_a_trusted_proxy(app):
    """A header any client can set must never become displayed fact."""
    spoofed = {"CF-IPCity": "Nowhere", "CF-IPCountry": "BR"}
    assert _location_for(app, spoofed, trusted_hops="0") is None


def test_login_records_no_location_without_a_trusted_proxy(app, client, paddler, denylist):
    access_token, _ = _login(client, paddler)
    with app.app_context():
        session = db.session.get(Session, UUID(_sid(app, access_token)))
        assert session.location_label is None


# =============================================================================
# Forwarded client identity
# =============================================================================
#
# Web sign-in reaches the backend from a Next server action, so the request's own
# User-Agent is Node's and its origin is the server's — every browser session was
# labelled "Unknown device", and in production each 15-minute refresh overwrote the
# location with the server's. Next forwards the browser's values instead, and they are
# trusted only alongside a shared secret: a header any caller can set must not let a
# stolen session dress itself up as the owner's own laptop, which is the one question
# this list exists to answer.

_FORWARD_SECRET = "s3cret-forwarding-key"


def _identity_for(app, headers, secret=_FORWARD_SECRET, trusted_hops="0"):
    env = {"PROXY_TRUSTED_HOPS": trusted_hops}
    if secret is not None:
        env["CLIENT_FORWARDING_SECRET"] = secret
    with patch.dict(os.environ, env, clear=False):
        if secret is None:
            os.environ.pop("CLIENT_FORWARDING_SECRET", None)
        with app.test_request_context("/", headers=headers):
            return (
                resolve_device_label(request.headers.get("User-Agent")),
                resolve_location_label(),
            )


def test_forwarded_identity_is_used_when_the_secret_matches(app):
    device, location = _identity_for(app, {
        "User-Agent": "node",
        "X-Client-Forwarded": _FORWARD_SECRET,
        "X-Client-User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/131.0 Safari/537.36",
        "X-Client-City": "Genoa",
        "X-Client-Region": "Liguria",
        "X-Client-Country": "IT",
    })
    assert device == "Chrome on macOS"
    assert location == "Genoa, Liguria, Italy"


def test_forwarded_identity_is_ignored_without_the_secret(app):
    device, location = _identity_for(app, {
        "User-Agent": "node",
        "X-Client-User-Agent": "Mozilla/5.0 (Macintosh) Chrome/131.0 Safari/537.36",
        "X-Client-City": "Nowhere",
        "X-Client-Country": "BR",
    })
    assert device is None
    assert location is None


def test_forwarded_identity_is_ignored_when_the_secret_is_wrong(app):
    device, location = _identity_for(app, {
        "User-Agent": "node",
        "X-Client-Forwarded": "not-the-secret",
        "X-Client-User-Agent": "Mozilla/5.0 (Macintosh) Chrome/131.0 Safari/537.36",
        "X-Client-City": "Nowhere",
        "X-Client-Country": "BR",
    })
    assert device is None
    assert location is None


def test_forwarded_identity_is_ignored_when_no_secret_is_configured(app):
    """Unset means "this deployment does not forward", not "trust anyone who asks"."""
    device, location = _identity_for(app, {
        "X-Client-Forwarded": "anything",
        "X-Client-User-Agent": "Mozilla/5.0 (Macintosh) Chrome/131.0 Safari/537.36",
        "X-Client-Country": "BR",
    }, secret=None)
    assert device is None
    assert location is None


def test_forwarded_location_stands_without_a_trusted_proxy(app):
    """The trusted-hops gate exists because Cloudflare's own headers are client-spoofable.
    A forwarded header already proved itself with the shared secret, so it does not need
    that gate — and must not, since a deployment can forward without Cloudflare at all."""
    _, location = _identity_for(app, {
        "X-Client-Forwarded": _FORWARD_SECRET,
        "X-Client-City": "Genoa",
        "X-Client-Country": "IT",
    }, trusted_hops="0")
    assert location == "Genoa, Italy"


def test_refresh_fills_in_a_device_label_that_was_never_recorded(app, client, paddler, denylist):
    """Sessions created before the forwarding existed carry no device label, and a paddler
    should not have to sign out everywhere to clear "Unknown device" from their list. The
    refresh already re-resolves the location; resolving the device alongside it heals those
    rows on their own next refresh, which happens within fifteen minutes of ordinary use."""
    access_token, refresh_token = _login(client, paddler)
    with app.app_context():
        session = db.session.get(Session, UUID(_sid(app, access_token)))
        session.device_label = None
        db.session.commit()

    with patch.dict(os.environ, {"CLIENT_FORWARDING_SECRET": _FORWARD_SECRET}):
        response = client.post(
            "/api/v1/auth/refresh",
            json={"refresh_token": refresh_token},
            headers={
                "X-Client-Forwarded": _FORWARD_SECRET,
                "X-Client-User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/131.0 Safari/537.36",
            },
        )
    assert response.status_code == 200

    with app.app_context():
        healed = db.session.get(Session, UUID(_sid(app, access_token)))
        assert healed.device_label == "Chrome on macOS"


def test_refresh_does_not_erase_a_label_it_cannot_resolve(app, client, paddler, denylist):
    """A refresh that carries no usable identity must leave what is already there alone —
    otherwise one call from a client that does not forward wipes a good label."""
    access_token, refresh_token = _login(client, paddler)
    with app.app_context():
        session = db.session.get(Session, UUID(_sid(app, access_token)))
        session.device_label = "Chrome on macOS"
        db.session.commit()

    response = client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})
    assert response.status_code == 200

    with app.app_context():
        kept = db.session.get(Session, UUID(_sid(app, access_token)))
        assert kept.device_label == "Chrome on macOS"


@pytest.mark.parametrize("user_agent,expected", [
    ("Kayaktrek/1.0.11 (Android 14; Pixel 8)", "Kayaktrek app on Pixel 8"),
    ("Kayaktrek/1.0.11 (Android 14)", "Kayaktrek app on Android"),
    ("Kayaktrek/1.0.11 (iOS 18.0)", "Kayaktrek app on iOS"),
    ("Kayaktrek/1.0.11", "Kayaktrek app"),
])
def test_the_mobile_app_is_recognised_by_its_own_user_agent(app, user_agent, expected):
    """React Native sends okhttp/… by default, which matches no browser or platform token,
    so every phone session read "Unknown device"."""
    assert resolve_device_label(user_agent) == expected
