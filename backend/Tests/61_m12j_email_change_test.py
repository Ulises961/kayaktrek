"""M12 §J — email-change request/verify flow.

Uses freshly-registered users throughout (never the session-scoped user_1/user_2
fixtures) because verifying an email change mutates `mail` and bumps
`token_version` — state that would leak into every later test file sharing
those session-scoped fixtures on the same pytest-xdist worker.
"""
import hashlib
import re
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from Api.database import db
from Api.mail import mail
from Models.auth_token import AuthToken, AuthTokenType
from Models.user import User

USER_ENDPOINT = "/api/v1/user"
_PWD = "EmailChange9$"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _register_active(client, suffix=None):
    suffix = suffix or uuid.uuid4().hex[:8]
    numeric = str(int(suffix, 16) % 100_000_000).zfill(8)
    data = {
        "mail": f"emailchange_{suffix}@example.com",
        "pwd": _PWD,
        "phone": f"+392{numeric}",
        "name": "Email",
        "surname": "Change",
        "username": f"emailchange_{suffix}",
    }
    r = client.post("/api/v1/auth/register", json=data)
    assert r.status_code == 201
    user = User.query.filter_by(mail=data["mail"]).first()
    user.active = True
    db.session.commit()
    return data, user


def _login(client, data):
    r = client.post("/api/v1/auth/login", json={"mail": data["mail"], "pwd": data["pwd"]})
    assert r.status_code == 200
    return r.get_json()["access_token"]


def _elevated_headers(client, data, access_token):
    r = client.post(
        f"{USER_ENDPOINT}/me/re-auth",
        headers={"Authorization": f"Bearer {access_token}"},
        json={"password": data["pwd"]},
    )
    assert r.status_code == 200
    return {"Authorization": f"Bearer {access_token}", "X-Elevated-Token": r.json["elevatedToken"]}


def _insert_token(user_id, token_type, *, expired=False, used=False):
    """Insert an AuthToken row directly; returns the raw token string."""
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


def _extract_token(email_body):
    m = re.search(r"token=([\w\-]+)", email_body)
    assert m, f"no token= found in email body: {email_body!r}"
    return m.group(1)


# ---------------------------------------------------------------------------
# Request half — POST /api/v1/user/me/email-change
# ---------------------------------------------------------------------------

class TestRequestEmailChange:

    def test_requires_elevated_token(self, app, client):
        data, _ = _register_active(client)
        access_token = _login(client, data)
        r = client.post(
            f"{USER_ENDPOINT}/me/email-change",
            headers={"Authorization": f"Bearer {access_token}"},
            json={"newMail": "somewhere_else@example.com"},
        )
        assert r.status_code == 403

    def test_missing_new_mail_returns_400(self, app, client):
        data, _ = _register_active(client)
        access_token = _login(client, data)
        headers = _elevated_headers(client, data, access_token)
        r = client.post(f"{USER_ENDPOINT}/me/email-change", headers=headers, json={})
        assert r.status_code == 400

    def test_invalid_format_returns_400(self, app, client):
        data, _ = _register_active(client)
        access_token = _login(client, data)
        headers = _elevated_headers(client, data, access_token)
        r = client.post(
            f"{USER_ENDPOINT}/me/email-change", headers=headers, json={"newMail": "not-an-email"}
        )
        assert r.status_code == 400

    def test_rejects_own_current_address(self, app, client):
        data, _ = _register_active(client)
        access_token = _login(client, data)
        headers = _elevated_headers(client, data, access_token)
        r = client.post(
            f"{USER_ENDPOINT}/me/email-change", headers=headers, json={"newMail": data["mail"]}
        )
        assert r.status_code == 400

    def test_sends_confirmation_to_new_address_only(self, app, client):
        data, user = _register_active(client)
        access_token = _login(client, data)
        headers = _elevated_headers(client, data, access_token)
        new_mail = f"new_{uuid.uuid4().hex[:8]}@example.com"

        with mail.record_messages() as outbox:
            r = client.post(
                f"{USER_ENDPOINT}/me/email-change", headers=headers, json={"newMail": new_mail}
            )
        assert r.status_code == 202
        assert len(outbox) == 1
        assert outbox[0].recipients == [new_mail]
        assert "confirm" in outbox[0].subject.lower()

        db.session.refresh(user)
        assert user.pending_mail == new_mail
        assert user.mail == data["mail"]  # not swapped yet — only on verify

    def test_silently_noops_for_address_already_taken(self, app, client):
        other_data, other_user = _register_active(client)
        data, user = _register_active(client)
        access_token = _login(client, data)
        headers = _elevated_headers(client, data, access_token)

        with mail.record_messages() as outbox:
            r = client.post(
                f"{USER_ENDPOINT}/me/email-change",
                headers=headers,
                json={"newMail": other_data["mail"]},
            )
        assert r.status_code == 202
        assert len(outbox) == 0

        db.session.refresh(user)
        db.session.refresh(other_user)
        assert user.pending_mail is None
        assert other_user.pending_mail is None
        assert other_user.mail == other_data["mail"]

    def test_second_request_invalidates_first_pending_token(self, app, client):
        data, _ = _register_active(client)
        access_token = _login(client, data)
        headers = _elevated_headers(client, data, access_token)

        first_mail = f"first_{uuid.uuid4().hex[:8]}@example.com"
        second_mail = f"second_{uuid.uuid4().hex[:8]}@example.com"

        with mail.record_messages() as outbox1:
            r1 = client.post(
                f"{USER_ENDPOINT}/me/email-change", headers=headers, json={"newMail": first_mail}
            )
        assert r1.status_code == 202
        first_raw = _extract_token(outbox1[0].body)

        r2 = client.post(
            f"{USER_ENDPOINT}/me/email-change", headers=headers, json={"newMail": second_mail}
        )
        assert r2.status_code == 202

        verify_r = client.get(f"/api/v1/auth/verify-email-change?token={first_raw}")
        assert verify_r.status_code == 400


# ---------------------------------------------------------------------------
# Verify half — GET /api/v1/auth/verify-email-change
# ---------------------------------------------------------------------------

class TestVerifyEmailChange:

    def test_missing_token_returns_400(self, app, client):
        r = client.get("/api/v1/auth/verify-email-change")
        assert r.status_code == 400

    def test_invalid_token_returns_400(self, app, client):
        r = client.get("/api/v1/auth/verify-email-change?token=not-a-real-token")
        assert r.status_code == 400

    def test_end_to_end_swaps_mail_and_bumps_token_version(self, app, client):
        data, user = _register_active(client)
        access_token = _login(client, data)
        headers = _elevated_headers(client, data, access_token)
        new_mail = f"verified_{uuid.uuid4().hex[:8]}@example.com"

        with mail.record_messages() as outbox:
            client.post(f"{USER_ENDPOINT}/me/email-change", headers=headers, json={"newMail": new_mail})
        raw = _extract_token(outbox[0].body)

        old_token_version = user.token_version
        r = client.get(f"/api/v1/auth/verify-email-change?token={raw}")
        assert r.status_code == 200
        assert r.get_json()["mail"] == new_mail

        db.session.refresh(user)
        assert user.mail == new_mail
        assert user.pending_mail is None
        assert user.token_version == old_token_version + 1

    def test_expired_token_rejected(self, app, client):
        data, user = _register_active(client)
        user.pending_mail = "expired_target@example.com"
        db.session.commit()
        raw = _insert_token(user.id, AuthTokenType.EMAIL_CHANGE, expired=True)

        r = client.get(f"/api/v1/auth/verify-email-change?token={raw}")
        assert r.status_code == 400

    def test_used_token_rejected(self, app, client):
        data, user = _register_active(client)
        user.pending_mail = "used_target@example.com"
        db.session.commit()
        raw = _insert_token(user.id, AuthTokenType.EMAIL_CHANGE, used=True)

        r = client.get(f"/api/v1/auth/verify-email-change?token={raw}")
        assert r.status_code == 400

    def test_reset_token_rejected_for_email_change(self, app, client):
        """A RESET token cannot be used to verify an email change."""
        data, user = _register_active(client)
        user.pending_mail = "wrong_type_target@example.com"
        db.session.commit()
        raw = _insert_token(user.id, AuthTokenType.RESET)

        r = client.get(f"/api/v1/auth/verify-email-change?token={raw}")
        assert r.status_code == 400

    def test_race_condition_pending_address_taken_meanwhile(self, app, client):
        data, user = _register_active(client)
        other_data, _ = _register_active(client)

        # Simulate: the pending address got claimed by someone else after the
        # request was sent but before the link was clicked.
        user.pending_mail = other_data["mail"]
        db.session.commit()
        raw = _insert_token(user.id, AuthTokenType.EMAIL_CHANGE)

        r = client.get(f"/api/v1/auth/verify-email-change?token={raw}")
        assert r.status_code == 400

        db.session.refresh(user)
        assert user.pending_mail is None
        assert user.mail == data["mail"]

    def test_old_sessions_invalidated_after_email_change(self, app, client):
        data, _ = _register_active(client)
        login = client.post("/api/v1/auth/login", json={"mail": data["mail"], "pwd": data["pwd"]})
        body = login.get_json()
        access_token, refresh_tok = body["access_token"], body["refresh_token"]
        headers = _elevated_headers(client, data, access_token)

        new_mail = f"oldsession_{uuid.uuid4().hex[:8]}@example.com"
        with mail.record_messages() as outbox:
            client.post(f"{USER_ENDPOINT}/me/email-change", headers=headers, json={"newMail": new_mail})
        raw = _extract_token(outbox[0].body)
        client.get(f"/api/v1/auth/verify-email-change?token={raw}")

        r = client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_tok})
        assert r.status_code == 401

    def test_login_with_new_email_works_after_verify(self, app, client):
        data, _ = _register_active(client)
        access_token = _login(client, data)
        headers = _elevated_headers(client, data, access_token)
        new_mail = f"loginnew_{uuid.uuid4().hex[:8]}@example.com"

        with mail.record_messages() as outbox:
            client.post(f"{USER_ENDPOINT}/me/email-change", headers=headers, json={"newMail": new_mail})
        raw = _extract_token(outbox[0].body)
        client.get(f"/api/v1/auth/verify-email-change?token={raw}")

        login = client.post("/api/v1/auth/login", json={"mail": new_mail, "pwd": data["pwd"]})
        assert login.status_code == 200

    def test_login_with_old_email_rejected_after_verify(self, app, client):
        data, _ = _register_active(client)
        access_token = _login(client, data)
        headers = _elevated_headers(client, data, access_token)
        new_mail = f"loginold_{uuid.uuid4().hex[:8]}@example.com"

        with mail.record_messages() as outbox:
            client.post(f"{USER_ENDPOINT}/me/email-change", headers=headers, json={"newMail": new_mail})
        raw = _extract_token(outbox[0].body)
        client.get(f"/api/v1/auth/verify-email-change?token={raw}")

        login = client.post("/api/v1/auth/login", json={"mail": data["mail"], "pwd": data["pwd"]})
        assert login.status_code == 401

    def test_old_address_receives_change_notice_email(self, app, client):
        data, _ = _register_active(client)
        access_token = _login(client, data)
        headers = _elevated_headers(client, data, access_token)
        new_mail = f"notice_{uuid.uuid4().hex[:8]}@example.com"

        with mail.record_messages() as outbox1:
            client.post(f"{USER_ENDPOINT}/me/email-change", headers=headers, json={"newMail": new_mail})
        raw = _extract_token(outbox1[0].body)

        with mail.record_messages() as outbox2:
            client.get(f"/api/v1/auth/verify-email-change?token={raw}")
        assert len(outbox2) == 1
        assert outbox2[0].recipients == [data["mail"]]
        assert "changed" in outbox2[0].subject.lower()
