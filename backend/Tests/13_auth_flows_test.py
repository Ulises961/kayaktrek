import hashlib
import uuid
from datetime import datetime, timedelta, timezone

import pytest

from Api.database import db
from Models.auth_token import AuthToken, AuthTokenType
from Models.user import User
from Services.auth_service import AuthService


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _register(client, suffix=None):
    suffix = suffix or uuid.uuid4().hex[:8]
    numeric = str(int(suffix, 16) % 100_000_000).zfill(8)
    data = {
        "mail": f"authflow_{suffix}@example.com",
        "pwd": "AuthFlow9$",
        "phone": f"+390{numeric}",
        "name": "Auth",
        "surname": "Flow",
        "username": f"authflow_{suffix}",
    }
    r = client.post("/api/auth/register", json=data)
    assert r.status_code == 201
    return data


def _insert_token(user_id, token_type, *, expired=False, used=False):
    """Insert an AuthToken row directly; returns the raw token string."""
    import secrets
    raw = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(raw.encode()).hexdigest()
    delta = timedelta(hours=-1) if expired else timedelta(hours=24)
    auth_token = AuthToken()
    auth_token.user_id = user_id
    auth_token.token_hash = token_hash
    auth_token.type = token_type
    auth_token.expires_at = datetime.now(timezone.utc) + delta
    auth_token.used = used
    db.session.add(auth_token)
    db.session.commit()
    return raw


# ---------------------------------------------------------------------------
# Account activation
# ---------------------------------------------------------------------------

class TestAccountActivation:

    def test_unverified_user_cannot_login(self, app, client):
        """Registered but unactivated user gets 403 on login."""
        d = _register(client)
        r = client.post("/api/auth/login", json={"mail": d["mail"], "pwd": d["pwd"]})
        assert r.status_code == 401

    def test_verify_token_activates_account(self, app, client):
        """Valid verification token activates account; subsequent login succeeds."""
        d = _register(client)
        user = User.query.filter_by(mail=d["mail"]).first()
        assert user is not None
        raw = _insert_token(user.id, AuthTokenType.VERIFICATION)

        r = client.get(f"/api/auth/verify?token={raw}")
        assert r.status_code == 200

        login = client.post("/api/auth/login", json={"mail": d["mail"], "username": d["username"], "pwd": d["pwd"]})
        assert login.status_code == 200
        assert login.get_json()["status"] == "success"

    def test_expired_verification_token_rejected(self, app, client):
        """Expired verification token returns 400."""
        d = _register(client)
        user = User.query.filter_by(mail=d["mail"]).first()
        assert user is not None
        raw = _insert_token(user.id, AuthTokenType.VERIFICATION, expired=True)

        r = client.get(f"/api/auth/verify?token={raw}")
        assert r.status_code == 400

    def test_used_verification_token_rejected(self, app, client):
        """Already-used verification token returns 400."""
        d = _register(client)
        user = User.query.filter_by(mail=d["mail"]).first()
        assert user is not None
        raw = _insert_token(user.id, AuthTokenType.VERIFICATION, used=True)

        r = client.get(f"/api/auth/verify?token={raw}")
        assert r.status_code == 400

    def test_token_cannot_be_reused(self, app, client):
        """Valid token works once; second use returns 400."""
        d = _register(client)
        user = User.query.filter_by(mail=d["mail"]).first()
        assert user is not None
        raw = _insert_token(user.id, AuthTokenType.VERIFICATION)

        client.get(f"/api/auth/verify?token={raw}")
        r2 = client.get(f"/api/auth/verify?token={raw}")
        assert r2.status_code == 400

    def test_missing_token_param_returns_400(self, client):
        r = client.get("/api/auth/verify")
        assert r.status_code == 400

    def test_invalid_token_returns_400(self, client):
        r = client.get("/api/auth/verify?token=notarealtoken")
        assert r.status_code == 400


# ---------------------------------------------------------------------------
# Resend verification
# ---------------------------------------------------------------------------

class TestResendVerification:

    def test_resend_sends_new_token_and_invalidates_old(self, app, client):
        """Old unused tokens are invalidated; new token can activate account."""
        d = _register(client)
        user = User.query.filter_by(mail=d["mail"]).first()
        assert user is not None
        old_raw = _insert_token(user.id, AuthTokenType.VERIFICATION)

        r = client.post("/api/auth/resend-verification", json={"mail": d["mail"]})
        assert r.status_code == 200

        old_hash = hashlib.sha256(old_raw.encode()).hexdigest()
        old_token = db.session.query(AuthToken).filter_by(token_hash=old_hash).first()
        assert old_token is not None
        assert old_token.used is True

    def test_old_token_no_longer_works_after_resend(self, app, client):
        """Token invalidated by resend returns 400."""
        d = _register(client)
        user = User.query.filter_by(mail=d["mail"]).first()
        assert user is not None
        old_raw = _insert_token(user.id, AuthTokenType.VERIFICATION)

        client.post("/api/auth/resend-verification", json={"mail": d["mail"]})
        r = client.get(f"/api/auth/verify?token={old_raw}")
        assert r.status_code == 400

    def test_resend_already_active_returns_400(self, app, client):
        """Resend for an already-active account returns 400."""
        d = _register(client)
        user = User.query.filter_by(mail=d["mail"]).first()
        assert user is not None
        user.active = True
        db.session.commit()

        r = client.post("/api/auth/resend-verification", json={"mail": d["mail"]})
        assert r.status_code == 400

    def test_resend_unknown_mail_returns_404(self, client):
        r = client.post("/api/auth/resend-verification", json={"mail": "nobody@example.com"})
        assert r.status_code == 404

    def test_resend_missing_mail_returns_400(self, client):
        r = client.post("/api/auth/resend-verification", json={})
        assert r.status_code == 400


# ---------------------------------------------------------------------------
# Password reset
# ---------------------------------------------------------------------------

class TestPasswordReset:

    def test_forgot_password_always_200(self, client):
        """Endpoint is always 200 regardless of whether the address is registered."""
        r1 = client.post("/api/auth/forgot-password", json={"mail": "nobody@nowhere.com"})
        assert r1.status_code == 200

        d = _register(client)
        r2 = client.post("/api/auth/forgot-password", json={"mail": d["mail"]})
        assert r2.status_code == 200

    def test_reset_password_end_to_end(self, app, client):
        """Valid reset token changes password; new password works for login."""
        d = _register(client)
        user = User.query.filter_by(mail=d["mail"]).first()
        assert user is not None
        user.active = True
        db.session.commit()
        raw = _insert_token(user.id, AuthTokenType.RESET)

        new_pwd = "NewSecure9$"
        r = client.post("/api/auth/reset-password", json={"token": raw, "pwd": new_pwd})
        assert r.status_code == 200

        login = client.post("/api/auth/login", json={"mail": d["mail"], "username": d["username"], "pwd": new_pwd})
        assert login.status_code == 200

    def test_old_password_rejected_after_reset(self, app, client):
        """Old password no longer works after a successful reset."""
        d = _register(client)
        user = User.query.filter_by(mail=d["mail"]).first()
        assert user is not None
        user.active = True
        db.session.commit()
        raw = _insert_token(user.id, AuthTokenType.RESET)

        client.post("/api/auth/reset-password", json={"token": raw, "pwd": "NewSecure9$"})

        login = client.post("/api/auth/login", json={"mail": d["mail"], "username": d["username"], "pwd": d["pwd"]})
        assert login.status_code == 401

    def test_expired_reset_token_rejected(self, app, client):
        d = _register(client)
        user = User.query.filter_by(mail=d["mail"]).first()
        assert user is not None
        raw = _insert_token(user.id, AuthTokenType.RESET, expired=True)

        r = client.post("/api/auth/reset-password", json={"token": raw, "pwd": "NewPwd9$"})
        assert r.status_code == 400

    def test_used_reset_token_rejected(self, app, client):
        d = _register(client)
        user = User.query.filter_by(mail=d["mail"]).first()
        assert user is not None
        raw = _insert_token(user.id, AuthTokenType.RESET, used=True)

        r = client.post("/api/auth/reset-password", json={"token": raw, "pwd": "NewPwd9$"})
        assert r.status_code == 400

    def test_reset_token_cannot_be_reused(self, app, client):
        d = _register(client)
        user = User.query.filter_by(mail=d["mail"]).first()
        assert user is not None
        raw = _insert_token(user.id, AuthTokenType.RESET)

        client.post("/api/auth/reset-password", json={"token": raw, "pwd": "FirstNew9$"})
        r2 = client.post("/api/auth/reset-password", json={"token": raw, "pwd": "SecondNew9$"})
        assert r2.status_code == 400

    def test_verification_token_rejected_for_reset(self, app, client):
        """A verification token cannot be used for a password reset."""
        d = _register(client)
        user = User.query.filter_by(mail=d["mail"]).first()
        assert user is not None
        raw = _insert_token(user.id, AuthTokenType.VERIFICATION)

        r = client.post("/api/auth/reset-password", json={"token": raw, "pwd": "NewPwd9$"})
        assert r.status_code == 400

    def test_reset_missing_fields_returns_400(self, client):
        r = client.post("/api/auth/reset-password", json={"token": "something"})
        assert r.status_code == 400

    def test_forgot_password_missing_mail_returns_400(self, client):
        r = client.post("/api/auth/forgot-password", json={})
        assert r.status_code == 400
