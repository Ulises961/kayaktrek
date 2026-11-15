"""
A mistyped email at signup used to strand the account for good: the verification mail went to
the wrong address, no login said so, and nothing let the owner correct it. A second gap sat
beside it — addresses were stored and compared exactly as typed, so a capital letter at password
reset found nobody and, by design, said nothing.

Covers the three repairs: addresses are one case-insensitive form everywhere
(`Services/Utils/mail_address.py`), `POST /auth/correct-unverified-mail` lets the password
holder of an unverified account fix the address, and a failed send is recorded where
`GET /health/mail` can report it.
"""
import logging
import re
import uuid
from unittest.mock import Mock, patch

import pytest
from sqlalchemy.exc import IntegrityError

from Api.database import db
from Api.mail import mail
from Models.auth_token import AuthToken, AuthTokenType
from Models.user import User
from Services.mail_service import (
    SEND_FAILURE_WINDOW_SECONDS,
    record_send_failure,
    recent_send_failure_count,
    send_template_email,
)
from Services.Utils.mail_address import is_valid_mail, normalize_mail

CORRECT_ENDPOINT = "/api/v1/auth/correct-unverified-mail"
PASSWORD = "Recover9$"


def _register(client, mail_addr=None):
    suffix = uuid.uuid4().hex[:8]
    data = {
        "mail": mail_addr or f"recover_{suffix}@example.com",
        "pwd": PASSWORD,
        "name": "Recover",
        "username": f"recover_{suffix}",
    }
    response = client.post("/api/v1/auth/register", json=data)
    assert response.status_code == 201
    return data


def _user(mail_addr):
    return db.session.query(User).filter_by(mail=mail_addr).first()


def _token_in(body):
    match = re.search(r"token=([\w-]+)", body)
    assert match, body
    return match.group(1)


class TestAddressNormalisation:
    def test_normalize_strips_and_lowercases(self):
        assert normalize_mail("  Name@Gmail.COM ") == "name@gmail.com"

    @pytest.mark.parametrize("address", ["name@gmail.com", "a.b+c@sub.example.org"])
    def test_valid_shapes(self, address):
        assert is_valid_mail(address)

    @pytest.mark.parametrize("address", ["", "no-at-sign", "a@b", "a@b.c", "x" * 250 + "@example.com"])
    def test_invalid_shapes(self, address):
        assert not is_valid_mail(address)

    def test_register_stores_the_normalised_address(self, app, client):
        suffix = uuid.uuid4().hex[:8]
        data = _register(client, f"  Mixed_{suffix}@Example.COM ")

        assert _user(f"mixed_{suffix}@example.com") is not None
        assert db.session.query(User).filter_by(username=data["username"]).first().mail == f"mixed_{suffix}@example.com"

    def test_registering_a_second_spelling_does_not_create_a_second_account(self, app, client):
        first = _register(client)
        other_username = f"other_{uuid.uuid4().hex[:8]}"

        with mail.record_messages() as outbox:
            response = client.post("/api/v1/auth/register", json={
                "mail": first["mail"].upper(), "pwd": PASSWORD, "name": "Other", "username": other_username,
            })

        assert response.status_code == 201
        assert db.session.query(User).filter(User.mail == first["mail"]).count() == 1
        assert db.session.query(User).filter_by(username=other_username).first() is None
        assert [message.recipients for message in outbox] == [[first["mail"]]]

    def test_password_reset_finds_the_account_whatever_the_case(self, app, client):
        data = _register(client)

        with mail.record_messages() as outbox:
            response = client.post("/api/v1/auth/forgot-password", json={"mail": f" {data['mail'].upper()} "})

        assert response.status_code == 200
        assert [message.recipients for message in outbox] == [[data["mail"]]]

    def test_login_works_with_a_differently_cased_address(self, app, client):
        data = _register(client)
        _user(data["mail"]).active = True
        db.session.commit()

        response = client.post("/api/v1/auth/login", json={"mail": data["mail"].title(), "pwd": data["pwd"]})

        assert response.status_code == 200

    def test_resend_verification_finds_the_account_whatever_the_case(self, app, client):
        data = _register(client)

        with mail.record_messages() as outbox:
            response = client.post("/api/v1/auth/resend-verification", json={"mail": data["mail"].upper()})

        assert response.status_code == 200
        assert [message.recipients for message in outbox] == [[data["mail"]]]

    def test_the_database_refuses_two_spellings_of_one_address(self, app, client):
        data = _register(client)
        duplicate = User(pwd=PASSWORD, mail=data["mail"].upper(), username=f"dup_{uuid.uuid4().hex[:8]}", name="Dup")
        db.session.add(duplicate)

        with pytest.raises(IntegrityError):
            db.session.commit()
        db.session.rollback()

        assert db.session.query(User).filter_by(username=data["username"]).first() is not None


class TestCorrectUnverifiedMail:
    def test_moves_the_account_and_mails_the_new_address_only(self, app, client):
        data = _register(client)
        new_mail = f"right_{uuid.uuid4().hex[:8]}@example.com"

        with mail.record_messages() as outbox:
            response = client.post(CORRECT_ENDPOINT, json={"mail": data["mail"], "pwd": PASSWORD, "newMail": new_mail})

        assert response.status_code == 200
        assert _user(data["mail"]) is None
        assert _user(new_mail).username == data["username"]
        assert [message.recipients for message in outbox] == [[new_mail]]

    def test_the_new_link_activates_the_account_and_the_old_one_is_dead(self, app, client):
        data = _register(client)
        user = _user(data["mail"])
        old_token = AuthToken.query.filter_by(user_id=user.id, type=AuthTokenType.VERIFICATION, used=False).first()
        assert old_token is not None
        new_mail = f"right_{uuid.uuid4().hex[:8]}@example.com"

        with mail.record_messages() as outbox:
            client.post(CORRECT_ENDPOINT, json={"mail": data["mail"], "pwd": PASSWORD, "newMail": new_mail})
        db.session.refresh(old_token)

        assert old_token.used is True
        assert client.get(f"/api/v1/auth/verify?token={_token_in(outbox[0].body)}").status_code == 200
        assert client.post("/api/v1/auth/login", json={"mail": new_mail, "pwd": PASSWORD}).status_code == 200

    def test_new_address_is_stored_normalised(self, app, client):
        data = _register(client)
        suffix = uuid.uuid4().hex[:8]

        client.post(CORRECT_ENDPOINT, json={"mail": data["mail"], "pwd": PASSWORD, "newMail": f" Right_{suffix}@Example.COM"})

        assert _user(f"right_{suffix}@example.com") is not None

    def test_without_a_new_address_it_resends_to_the_current_one(self, app, client):
        data = _register(client)

        with mail.record_messages() as outbox:
            response = client.post(CORRECT_ENDPOINT, json={"mail": data["mail"].upper(), "pwd": PASSWORD})

        assert response.status_code == 200
        assert _user(data["mail"]) is not None
        assert [message.recipients for message in outbox] == [[data["mail"]]]

    def test_wrong_password_and_unknown_account_are_the_same_401(self, app, client):
        data = _register(client)

        wrong_password = client.post(CORRECT_ENDPOINT, json={"mail": data["mail"], "pwd": "Wrong9$xx", "newMail": "x@example.com"})
        unknown = client.post(CORRECT_ENDPOINT, json={"mail": "nobody@example.com", "pwd": PASSWORD, "newMail": "x@example.com"})

        assert wrong_password.status_code == unknown.status_code == 401
        assert wrong_password.get_json() == unknown.get_json()
        assert _user(data["mail"]) is not None

    def test_a_wrong_password_sends_nothing_and_changes_nothing(self, app, client):
        data = _register(client)

        with mail.record_messages() as outbox:
            client.post(CORRECT_ENDPOINT, json={"mail": data["mail"], "pwd": "Wrong9$xx", "newMail": "x@example.com"})

        assert outbox == []
        assert _user(data["mail"]) is not None
        assert _user("x@example.com") is None

    def test_a_verified_account_cannot_use_it(self, app, client):
        data = _register(client)
        _user(data["mail"]).active = True
        db.session.commit()

        response = client.post(CORRECT_ENDPOINT, json={"mail": data["mail"], "pwd": PASSWORD, "newMail": "x@example.com"})

        assert response.status_code == 400
        assert response.get_json()["code"] == "already_verified"
        assert _user(data["mail"]) is not None

    def test_a_wrong_password_on_a_verified_account_does_not_say_it_is_verified(self, app, client):
        data = _register(client)
        _user(data["mail"]).active = True
        db.session.commit()

        response = client.post(CORRECT_ENDPOINT, json={"mail": data["mail"], "pwd": "Wrong9$xx"})

        assert response.status_code == 401
        assert "code" not in response.get_json()

    def test_a_pending_deletion_is_not_revealed(self, app, client):
        data = _register(client)
        from datetime import datetime, timezone
        _user(data["mail"]).deletion_requested_at = datetime.now(timezone.utc)
        db.session.commit()

        response = client.post(CORRECT_ENDPOINT, json={"mail": data["mail"], "pwd": PASSWORD, "newMail": "x@example.com"})

        assert response.status_code == 401

    def test_a_taken_address_looks_like_success_and_warns_its_owner(self, app, client):
        stranded = _register(client)
        owner = _register(client)

        with mail.record_messages() as outbox:
            response = client.post(CORRECT_ENDPOINT, json={"mail": stranded["mail"], "pwd": PASSWORD, "newMail": owner["mail"].upper()})

        assert response.status_code == 200
        assert _user(stranded["mail"]) is not None
        assert [message.recipients for message in outbox] == [[owner["mail"]]]
        assert "already" in outbox[0].subject.lower() or "tried to register" in outbox[0].subject.lower()

    @pytest.mark.parametrize("new_mail", ["not-an-address", "a@b", 42])
    def test_a_malformed_new_address_is_a_400_and_changes_nothing(self, app, client, new_mail):
        data = _register(client)

        response = client.post(CORRECT_ENDPOINT, json={"mail": data["mail"], "pwd": PASSWORD, "newMail": new_mail})

        assert response.status_code == 400
        assert _user(data["mail"]) is not None

    @pytest.mark.parametrize("body", [{}, {"mail": "a@example.com"}, {"pwd": PASSWORD}, {"mail": 5, "pwd": PASSWORD}])
    def test_missing_fields_are_a_400(self, client, body):
        assert client.post(CORRECT_ENDPOINT, json=body).status_code == 400

    def test_the_session_is_usable_after_a_refused_correction(self, app, client):
        data = _register(client)
        client.post(CORRECT_ENDPOINT, json={"mail": data["mail"], "pwd": "Wrong9$xx"})

        assert _user(data["mail"]) is not None


class TestMailFailureMonitoring:
    def test_a_failed_send_is_recorded(self, app, mail_failure_redis):
        with app.app_context(), patch("Api.mail.mail.send", side_effect=Exception("smtp down")):
            send_template_email("someone@example.test", "S", "account_verification", name="A", verify_url="https://x.test/v")

            assert recent_send_failure_count() == 1

    def test_a_successful_send_is_not(self, app, mail_failure_redis):
        with app.app_context():
            send_template_email("someone@example.test", "S", "account_verification", name="A", verify_url="https://x.test/v")

            assert recent_send_failure_count() == 0

    def test_the_log_names_the_template_and_status_but_not_the_recipient(self, app, caplog):
        response = Mock(status_code=401)
        error = Exception("boom")
        error.response = response
        with app.app_context(), patch("Api.mail.mail.send", side_effect=error), caplog.at_level(logging.ERROR):
            send_template_email("private.person@example.test", "S", "account_verification", name="A", verify_url="https://x.test/v")

        record = next(entry for entry in caplog.records if entry.message == "email_send_failed")
        assert record.template == "account_verification"
        assert record.status_code == 401
        assert record.exc_info is not None
        assert "private.person" not in caplog.text

    def test_failures_older_than_the_window_stop_counting(self, app, mail_failure_redis):
        with app.app_context():
            with patch("Services.mail_service.time.time", return_value=1_000_000.0):
                record_send_failure()
            with patch("Services.mail_service.time.time", return_value=1_000_000.0 + SEND_FAILURE_WINDOW_SECONDS + 1):
                assert recent_send_failure_count() == 0

    def test_an_unreachable_redis_never_breaks_the_send_path(self, app, mail_failure_redis):
        mail_failure_redis.down = True

        with app.app_context(), patch("Api.mail.mail.send", side_effect=Exception("smtp down")):
            send_template_email("someone@example.test", "S", "account_verification", name="A", verify_url="https://x.test/v")

            assert recent_send_failure_count() is None

    def test_the_probe_is_ok_with_no_failures(self, client):
        response = client.get("/api/v1/health/mail")

        assert response.status_code == 200
        assert response.get_json() == {"status": "ok", "recentFailures": 0}

    def test_the_probe_goes_503_after_a_failure(self, app, client):
        with patch("Api.mail.mail.send", side_effect=Exception("smtp down")):
            _register(client)

        response = client.get("/api/v1/health/mail")

        assert response.status_code == 503
        assert response.get_json() == {"status": "degraded", "recentFailures": 1}

    def test_an_unreadable_record_is_unknown_not_ok(self, client, mail_failure_redis):
        mail_failure_redis.down = True

        response = client.get("/api/v1/health/mail")

        assert response.status_code == 200
        assert response.get_json() == {"status": "unknown"}

    def test_the_main_health_check_is_unaffected_by_mail_failures(self, app, client):
        with patch("Api.mail.mail.send", side_effect=Exception("smtp down")):
            _register(client)

        assert client.get("/api/v1/health").status_code == 200
