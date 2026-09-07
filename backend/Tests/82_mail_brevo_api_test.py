"""
Mail transport switches to Brevo's HTTP API when BREVO_API_KEY is configured.

DigitalOcean blocks outbound SMTP (ports 25, 465, 587) on every droplet, unconditionally —
confirmed 2026-09-06 when it silently killed registration in production (a hung SMTP connect
exhausted a Gunicorn worker via its hard timeout). Not liftable by a support ticket. Brevo's
HTTP API sends the same mail over 443, which nothing blocks, and keeps the domain's existing
SPF/DKIM/DMARC setup untouched — only the transport changes.

BREVO_API_KEY is unset in TestingConfig, so every other mail test in this suite exercises the
SMTP/Flask-Mail path unchanged (Tests/79_mail_identity_test.py). These tests turn the new path
on explicitly.
"""

from unittest.mock import Mock, patch

import pytest

from Api.mail import mail
from Services.mail_service import send_template_email


@pytest.fixture
def brevo_configured(app, monkeypatch):
    monkeypatch.setitem(app.config, "BREVO_API_KEY", "test-brevo-key")
    monkeypatch.setitem(app.config, "MAIL_DEFAULT_SENDER", "Kayaktrek <no-reply@kayaktrek.app>")


def test_sends_via_brevo_api_not_smtp_when_configured(app, brevo_configured):
    """The SMTP path (Flask-Mail) is never touched when BREVO_API_KEY is set."""
    mock_response = Mock(status_code=201)
    mock_response.raise_for_status = Mock()

    with app.app_context(), mail.record_messages() as outbox:
        with patch("Services.mail_service.requests.post", return_value=mock_response) as post:
            send_template_email(
                "someone@example.test",
                "Subject",
                "account_verification",
                name="Ada",
                verify_url="https://example.test/v",
            )

    assert len(outbox) == 0  # nothing went through Flask-Mail
    post.assert_called_once()


def test_brevo_api_call_shape(app, brevo_configured):
    """Endpoint, auth header, and payload match Brevo's transactional email contract."""
    mock_response = Mock(status_code=201)
    mock_response.raise_for_status = Mock()

    with app.app_context():
        with patch("Services.mail_service.requests.post", return_value=mock_response) as post:
            send_template_email(
                "someone@example.test",
                "Verify your account",
                "account_verification",
                name="Ada",
                verify_url="https://example.test/v",
            )

    args, kwargs = post.call_args
    assert args[0] == "https://api.brevo.com/v3/smtp/email"
    assert kwargs["headers"]["api-key"] == "test-brevo-key"
    assert kwargs["timeout"] > 0

    payload = kwargs["json"]
    assert payload["sender"] == {"email": "no-reply@kayaktrek.app", "name": "Kayaktrek"}
    assert payload["to"] == [{"email": "someone@example.test"}]
    assert payload["subject"] == "Verify your account"
    assert "Ada" in payload["textContent"]
    assert "Ada" in payload["htmlContent"]


def test_brevo_api_failure_is_caught_and_logged_not_raised(app, brevo_configured, caplog):
    """
    A Brevo API error must not propagate into the caller.

    send_template_email has always swallowed send failures (Services/mail_service.py) so a
    mail hiccup never breaks the request that triggered it — the production incident this
    guards against was exactly a mail failure taking an entire request down. Applies to the
    new transport the same as the old one.
    """
    mock_response = Mock(status_code=400, text="Bad Request")
    mock_response.raise_for_status = Mock(side_effect=Exception("400 Bad Request"))

    with app.app_context():
        with patch("Services.mail_service.requests.post", return_value=mock_response):
            send_template_email(
                "someone@example.test",
                "Subject",
                "account_verification",
                name="Ada",
                verify_url="https://example.test/v",
            )  # must not raise

    assert "email_send_failed" in caplog.text


def test_falls_back_to_smtp_when_brevo_api_key_unset(app, monkeypatch):
    """No BREVO_API_KEY at all means the SMTP/Flask-Mail path, unchanged from before."""
    monkeypatch.setitem(app.config, "BREVO_API_KEY", "")
    monkeypatch.setitem(app.config, "MAIL_DEFAULT_SENDER", "hello@configured.test")

    with app.app_context(), mail.record_messages() as outbox:
        with patch("Services.mail_service.requests.post") as post:
            send_template_email(
                "someone@example.test",
                "Subject",
                "account_verification",
                name="Ada",
                verify_url="https://example.test/v",
            )

    post.assert_not_called()
    assert len(outbox) == 1
