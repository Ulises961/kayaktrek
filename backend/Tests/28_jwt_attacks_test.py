"""
JWT attack surface — S5.

Verifies that the JWT implementation rejects all standard attack vectors.
All tokens are crafted against the real JWT_SECRET_KEY from app.config so
the only thing distinguishing valid from invalid is the specific flaw under test.

§1  Structural / signature attacks
      - Expired access token → 401
      - Truncated token (1 or 2 segments) → 401
      - Random bytes / plaintext → 401
      - alg:none downgrade → 401 (PyJWT rejects when algorithms=['HS256'] is explicit)
      - Wrong secret → 401

§2  Token-type confusion
      - Refresh token submitted as Bearer access token → 401
      - Access token submitted to POST /api/auth/refresh → 401
      - Elevated token submitted as Bearer access token → 401

§3  Claim tampering
      - Valid-signature token but user_id references a non-existent user → 401

§4  Known gap — password change does not revoke outstanding tokens
      Stateless JWT: no jti / revocation list implemented yet.
      The test asserts the CURRENT behaviour (token stays valid) and documents
      the gap so it can be addressed before production launch.
"""
import base64
import json
from datetime import datetime, timedelta, timezone
from uuid import UUID

import jwt as pyjwt
import pytest

from Api.database import db as _db
from Models.user import User
from Resources.user_resource import USER_ENDPOINT
from Services.Middleware.auth_middleware import JWTService as _JWTService


DUMMY_UUID = "01900000-0000-7000-8000-000000000001"
_PROTECTED = f"{USER_ENDPOINT}/me"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _bearer(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _forge(app, payload_overrides: dict) -> str:
    """Sign a token with the real secret, overriding specific payload fields."""
    secret = app.config["JWT_SECRET_KEY"]
    base = {
        "user_id": DUMMY_UUID,
        "email": "x@x.com",
        "is_admin": False,
        "token_type": "access",
        "iat": datetime.now(timezone.utc),
        "exp": datetime.now(timezone.utc) + timedelta(minutes=15),
    }
    base.update(payload_overrides)
    return pyjwt.encode(base, secret, algorithm="HS256")


def _alg_none_token(user_id: str, email: str) -> str:
    """Craft a JWT with alg:none — unsigned, empty signature segment."""
    header = base64.urlsafe_b64encode(
        json.dumps({"alg": "none", "typ": "JWT"}).encode()
    ).rstrip(b"=").decode()
    payload = base64.urlsafe_b64encode(
        json.dumps({
            "user_id": str(user_id),
            "email": email,
            "token_type": "access",
            "exp": int((datetime.now(timezone.utc) + timedelta(hours=1)).timestamp()),
        }).encode()
    ).rstrip(b"=").decode()
    return f"{header}.{payload}."


# ---------------------------------------------------------------------------
# §1 — Structural / signature attacks
# ---------------------------------------------------------------------------

def test_expired_token_rejected(client, app, user_1):
    """An access token whose exp is in the past must return 401."""
    token = _forge(app, {
        "user_id": str(user_1.id),
        "email": user_1.mail,
        "exp": datetime.now(timezone.utc) - timedelta(seconds=1),
    })
    r = client.get(_PROTECTED, headers=_bearer(token))
    assert r.status_code == 401, f"expired token accepted → {r.status_code}"


def test_malformed_tokens_rejected(client, app, user_1):
    """Truncated, random, and syntactically invalid tokens must all return 401."""
    secret = app.config["JWT_SECRET_KEY"]
    valid = _forge(app, {"user_id": str(user_1.id), "email": user_1.mail})
    parts = valid.split(".")

    malformed = [
        ("truncated_header_only",           parts[0]),
        ("truncated_two_parts",             f"{parts[0]}.{parts[1]}"),
        ("empty_string",                    ""),
        ("plaintext",                       "not-a-token"),
        ("random_bytes",                    "abc.def.ghi"),
        ("extra_segment",                   f"{valid}.extrasegment"),
        ("missing_signature",               f"{parts[0]}.{parts[1]}."),
    ]
    for label, token in malformed:
        r = client.get(_PROTECTED, headers=_bearer(token))
        assert r.status_code == 401, f"[{label}] got {r.status_code}, want 401"


def test_alg_none_rejected(client, user_1):
    """
    A token declaring alg:none must be rejected.
    PyJWT rejects it because decode_token passes algorithms=['HS256'] explicitly.
    """
    token = _alg_none_token(user_1.id, user_1.mail)
    r = client.get(_PROTECTED, headers=_bearer(token))
    assert r.status_code == 401, f"alg:none token accepted → {r.status_code}"


def test_wrong_secret_rejected(client, user_1):
    """A token signed with a different secret must return 401."""
    token = pyjwt.encode(
        {
            "user_id": str(user_1.id),
            "email": user_1.mail,
            "is_admin": False,
            "token_type": "access",
            "exp": datetime.now(timezone.utc) + timedelta(minutes=15),
        },
        "completely-wrong-secret",
        algorithm="HS256",
    )
    r = client.get(_PROTECTED, headers=_bearer(token))
    assert r.status_code == 401, f"wrong-secret token accepted → {r.status_code}"


# ---------------------------------------------------------------------------
# §2 — Token-type confusion
# ---------------------------------------------------------------------------

def test_refresh_token_rejected_as_access(client, app, user_1):
    """
    A refresh token (token_type='refresh') used as a Bearer token must return 401.
    verify_token checks token_type against the expected value 'access'.
    """
    token = _forge(app, {
        "user_id": str(user_1.id),
        "token_type": "refresh",
        "exp": datetime.now(timezone.utc) + timedelta(days=30),
    })
    r = client.get(_PROTECTED, headers=_bearer(token))
    assert r.status_code == 401, f"refresh token accepted as access → {r.status_code}"


def test_access_token_rejected_at_refresh_endpoint(client, app, user_1):
    """
    An access token submitted to POST /api/auth/refresh must return 401.
    verify_token is called with token_type='refresh' — access token fails the check.
    """
    token = _forge(app, {"user_id": str(user_1.id), "email": user_1.mail})
    r = client.post("/api/v1/auth/refresh", json={"refresh_token": token})
    assert r.status_code == 401, f"access token accepted at refresh endpoint → {r.status_code}"


def test_elevated_token_rejected_as_access(client, app, user_1):
    """
    An elevated token (token_type='elevated') must not be accepted as a regular Bearer token.
    """
    token = _forge(app, {
        "user_id": str(user_1.id),
        "token_type": "elevated",
        "purpose": "sensitive_access",
        "exp": datetime.now(timezone.utc) + timedelta(minutes=5),
    })
    r = client.get(_PROTECTED, headers=_bearer(token))
    assert r.status_code == 401, f"elevated token accepted as access → {r.status_code}"


# ---------------------------------------------------------------------------
# §3 — Claim tampering
# ---------------------------------------------------------------------------

def test_nonexistent_user_id_rejected(client, app):
    """
    A correctly signed token whose user_id does not exist in the database must return 401.
    authenticate_restful calls UserService.get_user_by_id and aborts if None is returned.
    """
    token = _forge(app, {"user_id": DUMMY_UUID, "email": "ghost@example.com"})
    r = client.get(_PROTECTED, headers=_bearer(token))
    assert r.status_code == 401, f"non-existent user token accepted → {r.status_code}"


# ---------------------------------------------------------------------------
# §4 — Password change revokes outstanding tokens
# ---------------------------------------------------------------------------

@pytest.fixture(scope="function")
def pw_revocation_user(app, client):
    """
    Throwaway user for the revocation test.
    Session-scoped users must never have their passwords changed — stamping
    password_changed_at invalidates the session auth token for all remaining tests.
    """
    _PWD = "Before9$change"
    _NEW  = "After9$change"
    data = {
        "mail": "revoke.tmp@example.com",
        "pwd": _PWD,
        "phone": "+39099900004",
        "name": "Revoke",
        "username": "revoke_tmp",
    }
    client.post("/api/v1/auth/register", json=data)
    with app.app_context():
        user = User.query.filter_by(mail="revoke.tmp@example.com").first()
        user.active = True
        _db.session.commit()
        user_id = str(user.id)
        mail = user.mail
    yield {"user_id": user_id, "mail": mail, "pwd": _PWD, "new_pwd": _NEW}
    with app.app_context():
        u = _db.session.query(User).filter_by(id=UUID(user_id)).first()
        if u:
            _db.session.delete(u)
            _db.session.commit()


def test_token_invalidated_after_password_change(client, app, pw_revocation_user):
    """
    A token issued before a password change must be rejected once the password
    changes. authenticate_restful compares token iat against user.password_changed_at
    and aborts 401 if the token predates the change.
    """
    secret = app.config["JWT_SECRET_KEY"]
    uid = pw_revocation_user["user_id"]
    mail = pw_revocation_user["mail"]
    pwd = pw_revocation_user["pwd"]
    new_pwd = pw_revocation_user["new_pwd"]
    # A session id that is not on the revocation denylist, so the only thing that can
    # reject this token is the password-change check under test.
    session_id = "00000000-0000-7000-8000-000000000028"

    token_before = pyjwt.encode(
        {
            "user_id": uid,
            "email": mail,
            "is_admin": False,
            "token_type": "access",
            "tv": 0,
            "sid": session_id,
            "iat": datetime.now(timezone.utc),
            "exp": datetime.now(timezone.utc) + timedelta(minutes=15),
        },
        secret,
        algorithm="HS256",
    )

    # Confirm the pre-change token works
    r = client.get(_PROTECTED, headers=_bearer(token_before))
    assert r.status_code == 200, f"pre-change token rejected unexpectedly: {r.data}"

    # Change the password using the pre-change token
    r = client.patch(
        "/api/v1/user/me/password",
        json={"currentPwd": pwd, "newPwd": new_pwd},
        headers=_bearer(token_before),
    )
    assert r.status_code == 204, f"password change failed: {r.data}"

    # Pre-change token must now be rejected
    r = client.get(_PROTECTED, headers=_bearer(token_before))
    assert r.status_code == 401, (
        f"pre-change token still accepted after password change → {r.status_code}"
    )
