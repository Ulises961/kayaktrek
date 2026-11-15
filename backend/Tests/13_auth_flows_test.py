import hashlib
import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from Api.database import db
from Api.mail import mail
from Models.auth_token import AuthToken, AuthTokenType
from Models.session import Session
from Models.user import User
from Schemas.user_schema import UserSchema
from Services.crypto_service import encrypt
from Services.user_service import UserService


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
    r = client.post("/api/v1/auth/register", json=data)
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
        r = client.post("/api/v1/auth/login", json={"mail": d["mail"], "pwd": d["pwd"]})
        assert r.status_code == 401

    def test_verify_token_activates_account(self, app, client):
        """Valid verification token activates account; subsequent login succeeds."""
        d = _register(client)
        user = User.query.filter_by(mail=d["mail"]).first()
        assert user is not None
        raw = _insert_token(user.id, AuthTokenType.VERIFICATION)

        r = client.get(f"/api/v1/auth/verify?token={raw}")
        assert r.status_code == 200

        login = client.post("/api/v1/auth/login", json={"mail": d["mail"], "username": d["username"], "pwd": d["pwd"]})
        assert login.status_code == 200
        assert login.get_json()["status"] == "success"

    def test_expired_verification_token_rejected(self, app, client):
        """Expired verification token returns 400."""
        d = _register(client)
        user = User.query.filter_by(mail=d["mail"]).first()
        assert user is not None
        raw = _insert_token(user.id, AuthTokenType.VERIFICATION, expired=True)

        r = client.get(f"/api/v1/auth/verify?token={raw}")
        assert r.status_code == 400

    def test_used_verification_token_rejected(self, app, client):
        """Already-used verification token returns 400."""
        d = _register(client)
        user = User.query.filter_by(mail=d["mail"]).first()
        assert user is not None
        raw = _insert_token(user.id, AuthTokenType.VERIFICATION, used=True)

        r = client.get(f"/api/v1/auth/verify?token={raw}")
        assert r.status_code == 400

    def test_token_cannot_be_reused(self, app, client):
        """Valid token works once; second use returns 400."""
        d = _register(client)
        user = User.query.filter_by(mail=d["mail"]).first()
        assert user is not None
        raw = _insert_token(user.id, AuthTokenType.VERIFICATION)

        client.get(f"/api/v1/auth/verify?token={raw}")
        r2 = client.get(f"/api/v1/auth/verify?token={raw}")
        assert r2.status_code == 400

    def test_missing_token_param_returns_400(self, client):
        r = client.get("/api/v1/auth/verify")
        assert r.status_code == 400

    def test_invalid_token_returns_400(self, client):
        r = client.get("/api/v1/auth/verify?token=notarealtoken")
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

        r = client.post("/api/v1/auth/resend-verification", json={"mail": d["mail"]})
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

        client.post("/api/v1/auth/resend-verification", json={"mail": d["mail"]})
        r = client.get(f"/api/v1/auth/verify?token={old_raw}")
        assert r.status_code == 400

    def test_resend_already_active_answers_like_any_other_address(self, app, client):
        """No oracle: an active account gets the same 200, and no mail."""
        d = _register(client)
        user = User.query.filter_by(mail=d["mail"]).first()
        assert user is not None
        user.active = True
        db.session.commit()

        r = client.post("/api/v1/auth/resend-verification", json={"mail": d["mail"]})
        assert r.status_code == 200

    def test_resend_unknown_mail_answers_like_any_other_address(self, client):
        r = client.post("/api/v1/auth/resend-verification", json={"mail": "nobody@example.com"})
        assert r.status_code == 200

    def test_resend_missing_mail_returns_400(self, client):
        r = client.post("/api/v1/auth/resend-verification", json={})
        assert r.status_code == 400


# ---------------------------------------------------------------------------
# Password reset
# ---------------------------------------------------------------------------

class TestPasswordReset:

    def test_forgot_password_always_200(self, client):
        """Endpoint is always 200 regardless of whether the address is registered."""
        r1 = client.post("/api/v1/auth/forgot-password", json={"mail": "nobody@nowhere.com"})
        assert r1.status_code == 200

        d = _register(client)
        r2 = client.post("/api/v1/auth/forgot-password", json={"mail": d["mail"]})
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
        r = client.post("/api/v1/auth/reset-password", json={"token": raw, "pwd": new_pwd})
        assert r.status_code == 200

        login = client.post("/api/v1/auth/login", json={"mail": d["mail"], "username": d["username"], "pwd": new_pwd})
        assert login.status_code == 200

    def test_old_password_rejected_after_reset(self, app, client):
        """Old password no longer works after a successful reset."""
        d = _register(client)
        user = User.query.filter_by(mail=d["mail"]).first()
        assert user is not None
        user.active = True
        db.session.commit()
        raw = _insert_token(user.id, AuthTokenType.RESET)

        client.post("/api/v1/auth/reset-password", json={"token": raw, "pwd": "NewSecure9$"})

        login = client.post("/api/v1/auth/login", json={"mail": d["mail"], "username": d["username"], "pwd": d["pwd"]})
        assert login.status_code == 401

    def test_expired_reset_token_rejected(self, app, client):
        d = _register(client)
        user = User.query.filter_by(mail=d["mail"]).first()
        assert user is not None
        raw = _insert_token(user.id, AuthTokenType.RESET, expired=True)

        r = client.post("/api/v1/auth/reset-password", json={"token": raw, "pwd": "NewPwd9$"})
        assert r.status_code == 400

    def test_used_reset_token_rejected(self, app, client):
        d = _register(client)
        user = User.query.filter_by(mail=d["mail"]).first()
        assert user is not None
        raw = _insert_token(user.id, AuthTokenType.RESET, used=True)

        r = client.post("/api/v1/auth/reset-password", json={"token": raw, "pwd": "NewPwd9$"})
        assert r.status_code == 400

    def test_reset_token_cannot_be_reused(self, app, client):
        d = _register(client)
        user = User.query.filter_by(mail=d["mail"]).first()
        assert user is not None
        raw = _insert_token(user.id, AuthTokenType.RESET)

        client.post("/api/v1/auth/reset-password", json={"token": raw, "pwd": "FirstNew9$"})
        r2 = client.post("/api/v1/auth/reset-password", json={"token": raw, "pwd": "SecondNew9$"})
        assert r2.status_code == 400

    def test_verification_token_rejected_for_reset(self, app, client):
        """A verification token cannot be used for a password reset."""
        d = _register(client)
        user = User.query.filter_by(mail=d["mail"]).first()
        assert user is not None
        raw = _insert_token(user.id, AuthTokenType.VERIFICATION)

        r = client.post("/api/v1/auth/reset-password", json={"token": raw, "pwd": "NewPwd9$"})
        assert r.status_code == 400

    def test_reset_missing_fields_returns_400(self, client):
        r = client.post("/api/v1/auth/reset-password", json={"token": "something"})
        assert r.status_code == 400

    def test_forgot_password_missing_mail_returns_400(self, client):
        r = client.post("/api/v1/auth/forgot-password", json={})
        assert r.status_code == 400


# ---------------------------------------------------------------------------
# Medical-notes data loss on reset (security remediation Step 4)
# ---------------------------------------------------------------------------

class TestMedicalNotesReset:

    def _activated_user(self, client):
        d = _register(client)
        user = User.query.filter_by(mail=d["mail"]).first()
        assert user is not None
        user.active = True
        db.session.commit()
        return d, user

    def test_reset_with_notes_clears_data_sets_flag_and_emails(self, app, client):
        """A user who had medical notes gets them wiped, the reset flag set, and an email."""
        d, user = self._activated_user(client)
        user.medical_notes_ciphertext = "ciphertext"
        user.medical_notes_nonce = "nonce"
        user.medical_notes_salt = "salt"
        user.public_key = "pubkey"
        db.session.commit()
        raw = _insert_token(user.id, AuthTokenType.RESET)

        with mail.record_messages() as outbox:
            r = client.post("/api/v1/auth/reset-password", json={"token": raw, "pwd": "NewSecure9$"})
        assert r.status_code == 200

        db.session.refresh(user)
        assert user.medical_notes_ciphertext is None
        assert user.medical_notes_reset_at is not None
        assert any("medical notes" in m.subject.lower() for m in outbox)

    def test_reset_without_notes_no_flag_no_email(self, app, client):
        """A user with no medical notes is not flagged and not emailed about data loss."""
        d, user = self._activated_user(client)
        raw = _insert_token(user.id, AuthTokenType.RESET)

        with mail.record_messages() as outbox:
            r = client.post("/api/v1/auth/reset-password", json={"token": raw, "pwd": "NewSecure9$"})
        assert r.status_code == 200

        db.session.refresh(user)
        assert user.medical_notes_reset_at is None
        assert not any("medical notes" in m.subject.lower() for m in outbox)

    def test_reset_flag_exposed_in_user_schema(self, app, client):
        """medical_notes_reset_at is serialised (camelCase) so the UI can drive the prompt."""
        _, user = self._activated_user(client)
        user.medical_notes_ciphertext = "ciphertext"
        db.session.commit()
        raw = _insert_token(user.id, AuthTokenType.RESET)
        client.post("/api/v1/auth/reset-password", json={"token": raw, "pwd": "NewSecure9$"})

        db.session.refresh(user)
        dumped = UserSchema().dump(user)
        assert dumped.get("medicalNotesResetAt") is not None

    def test_granting_consent_clears_reset_flag(self, app, client):
        """Re-entering notes dismisses the pending reset prompt."""
        _, user = self._activated_user(client)
        user.medical_notes_reset_at = datetime.now(timezone.utc)
        db.session.commit()

        ciphertext, nonce, salt = encrypt("Allergic to penicillin", "AuthFlow9$")
        UserService.grant_medical_consent(str(user.id), ciphertext, nonce, salt)

        db.session.refresh(user)
        assert user.medical_notes_reset_at is None
        assert user.medical_notes_ciphertext is not None


# ---------------------------------------------------------------------------
# Mail-failure resilience
# ---------------------------------------------------------------------------
#
# Services/mail_service.send_template_email swallows every exception (logs and
# returns) specifically so a transient SMTP outage never blocks the auth flow
# that triggered it. That intent is never exercised elsewhere in this file —
# every other test runs against the real (test-mode no-op) mail backend, which
# never raises, so a regression that let a mail failure propagate and abort
# the transaction would pass the whole suite.

class TestMailFailureResilience:

    def test_register_persists_user_even_if_email_send_fails(self, app, client):
        """Registration must still create the (inactive) account when the
        verification email itself fails to send."""
        unique = uuid.uuid4().hex[:8]
        numeric = str(int(unique, 16) % 100_000_000).zfill(8)
        data = {
            "mail": f"mailfail_{unique}@example.com",
            "pwd": "MailFail9$",
            "phone": f"+390{numeric}",
            "name": "Mail",
            "username": f"mailfail_{unique}",
        }
        with patch("Api.mail.mail.send", side_effect=Exception("smtp down")):
            r = client.post("/api/v1/auth/register", json=data)
        assert r.status_code == 201

        user = User.query.filter_by(mail=data["mail"]).first()
        assert user is not None
        assert user.active is False

    def test_reset_password_applies_even_if_notification_email_fails(self, app, client):
        """A password reset that clears medical notes sends a notification email;
        that email failing must not roll back the password change or the notes
        wipe — the new password must still work for login."""
        d = _register(client)
        user = User.query.filter_by(mail=d["mail"]).first()
        assert user is not None
        user.active = True
        user.medical_notes_ciphertext = "ciphertext"
        user.medical_notes_nonce = "nonce"
        user.medical_notes_salt = "salt"
        user.public_key = "pubkey"
        db.session.commit()
        raw = _insert_token(user.id, AuthTokenType.RESET)

        with patch("Api.mail.mail.send", side_effect=Exception("smtp down")):
            r = client.post("/api/v1/auth/reset-password", json={"token": raw, "pwd": "NewSecure9$"})
        assert r.status_code == 200

        db.session.refresh(user)
        assert user.medical_notes_ciphertext is None

        login = client.post("/api/v1/auth/login", json={"mail": d["mail"], "pwd": "NewSecure9$"})
        assert login.status_code == 200


# ---------------------------------------------------------------------------
# Token revocation (HIGH-1 regression)
# ---------------------------------------------------------------------------

def _active_user_with_tokens(client):
    """Register, activate, and log in; return (user, access_token, refresh_token)."""
    suffix = uuid.uuid4().hex[:8]
    numeric = str(int(suffix, 16) % 100_000_000).zfill(8)
    d = {
        "mail": f"revoke_{suffix}@example.com",
        "pwd": "Revoke9$Test",
        "phone": f"+391{numeric}",
        "name": "Revoke",
        "surname": "Test",
        "username": f"revoke_{suffix}",
    }
    client.post("/api/v1/auth/register", json=d)
    user = User.query.filter_by(mail=d["mail"]).first()
    user.active = True
    from Api.database import db as _db
    _db.session.commit()

    r = client.post("/api/v1/auth/login", json={"mail": d["mail"], "pwd": d["pwd"]})
    body = r.get_json()
    return user, body["access_token"], body["refresh_token"]


class TestRevocableTokens:

    def test_refresh_token_rejected_after_password_reset(self, app, client):
        """HIGH-1 regression: refresh token from before a reset must be rejected."""
        user, _, refresh_tok = _active_user_with_tokens(client)

        raw_reset = _insert_token(user.id, AuthTokenType.RESET)
        client.post("/api/v1/auth/reset-password", json={"token": raw_reset, "pwd": "NewSecure9$"})

        r = client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_tok})
        assert r.status_code == 401

    def test_access_token_rejected_after_logout(self, app, client, denylist):
        """Access token issued before logout is rejected on subsequent requests.

        Since M17 logout ends one device rather than bumping the user-wide token_version,
        so what kills the still-unexpired access token is the revocation denylist — hence
        the fixture. Without it this asserts nothing wherever Redis is absent (CI).
        """
        user, access_tok, _ = _active_user_with_tokens(client)

        r1 = client.get("/api/v1/user/me", headers={"Authorization": f"Bearer {access_tok}"})
        assert r1.status_code == 200

        client.post("/api/v1/auth/logout", headers={"Authorization": f"Bearer {access_tok}"})

        r2 = client.get("/api/v1/user/me", headers={"Authorization": f"Bearer {access_tok}"})
        assert r2.status_code == 401

    def test_refresh_token_rejected_after_logout(self, app, client):
        """Refresh token issued before logout is rejected after logout."""
        user, access_tok, refresh_tok = _active_user_with_tokens(client)

        client.post("/api/v1/auth/logout", headers={"Authorization": f"Bearer {access_tok}"})

        r = client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_tok})
        assert r.status_code == 401

    def test_valid_session_survives_request_refresh_cycle(self, app, client):
        """Normal login → refresh cycle continues to work unchanged."""
        user, _, refresh_tok = _active_user_with_tokens(client)

        r = client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_tok})
        assert r.status_code == 200
        assert "access_token" in r.get_json()

    def test_logout_requires_auth(self, client):
        r = client.post("/api/v1/auth/logout")
        assert r.status_code in (401, 403)

    def test_deactivated_account_refresh_rejected(self, app, client):
        """Refresh endpoint rejects tokens for inactive accounts."""
        user, _, refresh_tok = _active_user_with_tokens(client)

        user.active = False
        db.session.commit()

        r = client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_tok})
        assert r.status_code == 403


class TestRefreshTokenRotation:
    """M11 §2 — rotate-on-use with reuse detection."""

    def test_refresh_rotates_the_refresh_token(self, app, client):
        """A successful refresh returns a NEW refresh token, distinct from the one presented."""
        _, _, refresh_tok = _active_user_with_tokens(client)

        r = client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_tok})
        assert r.status_code == 200
        body = r.get_json()
        assert "refresh_token" in body
        assert body["refresh_token"] != refresh_tok

    def test_reused_refresh_token_rejected(self, app, client):
        """Presenting the same refresh token twice: the second use is rejected."""
        _, _, refresh_tok = _active_user_with_tokens(client)

        r1 = client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_tok})
        assert r1.status_code == 200

        r2 = client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_tok})
        assert r2.status_code == 401

    def test_refresh_token_reuse_revokes_that_devices_session(self, app, client, denylist):
        """Reuse is treated as theft, and since M17 it costs exactly one device: every
        token in the offending session dies, and the user's other devices keep working.

        Before M17 this bumped the user-wide token_version and logged out everything —
        that behaviour is now reserved for actions the user actually took. The sibling
        session's survival is asserted in detail in 74_m17_session_auth_test.py; what
        matters here is that the offending chain is fully dead.
        """
        user, access_tok, refresh_tok = _active_user_with_tokens(client)

        r1 = client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_tok})
        assert r1.status_code == 200
        rotated_refresh = r1.get_json()["refresh_token"]

        # Reuse the original (already-rotated) refresh token — triggers revocation.
        r2 = client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_tok})
        assert r2.status_code == 401

        # The pre-reuse access token is dead — instantly, via the denylist, rather than
        # being left to expire on its own.
        r3 = client.get("/api/v1/user/me", headers={"Authorization": f"Bearer {access_tok}"})
        assert r3.status_code == 401

        # So is the refresh token issued by the legitimate rotation just before the reuse.
        r4 = client.post("/api/v1/auth/refresh", json={"refresh_token": rotated_refresh})
        assert r4.status_code == 401

    def test_refresh_chain_survives_multiple_legitimate_rotations(self, app, client):
        """Repeated legitimate refresh → rotate → refresh cycles keep working."""
        _, _, refresh_tok = _active_user_with_tokens(client)

        for _ in range(3):
            r = client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_tok})
            assert r.status_code == 200
            refresh_tok = r.get_json()["refresh_token"]

    def test_refresh_rejected_when_issued_before_password_change(self, app, client):
        """Parity check: a refresh token's iat predating password_changed_at is rejected
        even if token_version somehow still matched (defence-in-depth alongside the tv bump
        password change already performs)."""
        user, _, refresh_tok = _active_user_with_tokens(client)

        # Simulate password_changed_at moving forward WITHOUT touching token_version, to
        # exercise the iat check in isolation from the tv-based path.
        user.password_changed_at = datetime.now(timezone.utc) + timedelta(seconds=5)
        db.session.commit()

        r = client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_tok})
        assert r.status_code == 401


# ---------------------------------------------------------------------------
# POST /auth/verify — activate and sign in (M25 §3)
#
# The GET form stays as it is. The POST form is what the verify page calls, and it exists
# specifically because a GET must not mint a session: mail scanners and link-preview
# fetchers follow emailed links, and a session handed to one of those is a live refresh
# token nobody knows to revoke.
# ---------------------------------------------------------------------------

class TestVerifyAndSignIn:

    def test_post_verify_activates_and_returns_a_token_pair(self, app, client):
        d = _register(client)
        user = User.query.filter_by(mail=d["mail"]).first()
        assert user is not None
        raw = _insert_token(user.id, AuthTokenType.VERIFICATION)

        r = client.post("/api/v1/auth/verify", json={"token": raw})

        assert r.status_code == 200
        body = r.get_json()
        assert body["status"] == "success"
        assert body["access_token"]
        assert body["refresh_token"]

    def test_the_returned_session_actually_works(self, app, client):
        """The point of the endpoint is being signed in — assert the token authenticates."""
        d = _register(client)
        user = User.query.filter_by(mail=d["mail"]).first()
        raw = _insert_token(user.id, AuthTokenType.VERIFICATION)

        access = client.post("/api/v1/auth/verify", json={"token": raw}).get_json()["access_token"]

        me = client.get("/api/v1/user/me", headers={"Authorization": f"Bearer {access}"})
        assert me.status_code == 200
        assert me.get_json()["mail"] == d["mail"]

    def test_it_opens_a_real_session_row(self, app, client):
        """A per-device Session (M17) must exist, or the token carries an unrevocable sid."""
        d = _register(client)
        user = User.query.filter_by(mail=d["mail"]).first()
        raw = _insert_token(user.id, AuthTokenType.VERIFICATION)

        client.post("/api/v1/auth/verify", json={"token": raw})

        assert Session.query.filter_by(user_id=user.id).count() == 1

    def test_token_is_single_use(self, app, client):
        d = _register(client)
        user = User.query.filter_by(mail=d["mail"]).first()
        raw = _insert_token(user.id, AuthTokenType.VERIFICATION)

        client.post("/api/v1/auth/verify", json={"token": raw})
        second = client.post("/api/v1/auth/verify", json={"token": raw})

        assert second.status_code == 400

    def test_a_second_attempt_opens_no_further_session(self, app, client):
        """Failure path: the rejected retry must not leave another session behind."""
        d = _register(client)
        user = User.query.filter_by(mail=d["mail"]).first()
        raw = _insert_token(user.id, AuthTokenType.VERIFICATION)

        client.post("/api/v1/auth/verify", json={"token": raw})
        client.post("/api/v1/auth/verify", json={"token": raw})

        assert Session.query.filter_by(user_id=user.id).count() == 1

    def test_expired_token_rejected_and_no_session_created(self, app, client):
        d = _register(client)
        user = User.query.filter_by(mail=d["mail"]).first()
        raw = _insert_token(user.id, AuthTokenType.VERIFICATION, expired=True)

        r = client.post("/api/v1/auth/verify", json={"token": raw})

        assert r.status_code == 400
        assert Session.query.filter_by(user_id=user.id).count() == 0

    def test_missing_body_returns_400(self, client):
        assert client.post("/api/v1/auth/verify", json={}).status_code == 400

    def test_invalid_token_returns_400(self, client):
        assert client.post("/api/v1/auth/verify", json={"token": "notarealtoken"}).status_code == 400
