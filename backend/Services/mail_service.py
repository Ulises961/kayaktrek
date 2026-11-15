import logging
import time
import uuid
from email.utils import parseaddr
from typing import Any, Optional

import requests
from flask import current_app, render_template
from flask_mail import Message

from Api.mail import mail
from Api.redis import monitoring_redis
from Services import storage_service

logger = logging.getLogger(__name__)

SEND_FAILURES_KEY = "mail:send_failures"
SEND_FAILURE_WINDOW_SECONDS = 3600

# Object key of the rasterised brand mark in the public bucket. Written by
# scripts/build-mail-mark.sh; the committed copy is docs/brand/mail-mark-96.png.
MAIL_MARK_KEY = "brand/mail-mark-96.png"

BREVO_API_URL = "https://api.brevo.com/v3/smtp/email"


def _identity_context() -> dict[str, str]:
    """
    The sender-identity block every footer renders, resolved from config in one place.

    Resolving it here means a call site cannot get it wrong by omission, and there is
    no fallback literal to go stale: an unset sender renders nothing rather than
    something false.

    `postal_address` is deliberately unset by default. Publishing a postal address is
    a decision about trader identity (DSA), not a template default, so an operator
    opts in by setting MAIL_POSTAL_ADDRESS and the footer stays silent until then.
    """
    return {
        "support_email": current_app.config.get("MAIL_DEFAULT_SENDER") or "",
        "site_url": current_app.config.get("FRONTEND_URL") or "",
        "postal_address": current_app.config.get("MAIL_POSTAL_ADDRESS") or "",
        # Empty unless a public CDN base is configured, in which case the header renders
        # the brand mark beside the wordmark. Built by scripts/build-mail-mark.sh and
        # uploaded to the public bucket — see that script for why email needs a raster
        # with the dark colourway baked in rather than the SVG.
        "logo_url": storage_service.public_asset_url(MAIL_MARK_KEY),
    }


def _send_via_brevo_api(to: str, subject: str, text_body: str, html_body: str, api_key: str) -> None:
    """
    Brevo's transactional email HTTP API, not SMTP.

    DigitalOcean blocks outbound SMTP (ports 25, 465, 587) on every droplet. The API sends
    the same mail over 443, which nothing blocks, and needs its own credential (Brevo
    dashboard > SMTP & API > API Keys) — distinct from the SMTP key MAIL_PASSWORD holds,
    which stays configured for local dev/mailpit. Only the transport changes: same domain,
    same SPF/DKIM/DMARC setup (DEPLOY.md "Mail").
    """
    sender_name, sender_email = parseaddr(current_app.config.get("MAIL_DEFAULT_SENDER") or "")
    response = requests.post(
        BREVO_API_URL,
        json={
            "sender": {"email": sender_email, "name": sender_name or sender_email},
            "to": [{"email": to}],
            "subject": subject,
            "textContent": text_body,
            "htmlContent": html_body,
        },
        headers={
            "api-key": api_key,
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        timeout=10,
    )
    response.raise_for_status()


def send_template_email(to: str, subject: str, template: str, **ctx: Any) -> None:
    """
    Render and send a dual-part (plain text + HTML) email from templates.

    Templates are resolved from templates/email/<template>.txt and
    templates/email/<template>.html. Both parts are sent so the recipient's
    client chooses whichever it prefers.

    Transport is Brevo's HTTP API when BREVO_API_KEY is configured, SMTP (Flask-Mail)
    otherwise — see _send_via_brevo_api for why. Local dev/mailpit and CI/testing never set
    the key, so they keep using SMTP unchanged.

    Args:
        to:       Recipient email address.
        subject:  Email subject line.
        template: Template base name (e.g. "deletion_request" resolves
                  templates/email/deletion_request.txt + .html).
        **ctx:    Variables passed to both template renderers.
    """
    try:
        # Identity first so an explicit kwarg still wins, but no call site needs to pass one.
        ctx = {**_identity_context(), **ctx}
        text_body = render_template(f"email/{template}.txt", **ctx)
        html_body = render_template(f"email/{template}.html", **ctx)

        api_key = current_app.config.get("BREVO_API_KEY")
        if api_key:
            _send_via_brevo_api(to, subject, text_body, html_body, api_key)
        else:
            msg = Message(subject=subject, recipients=[to])
            msg.body = text_body
            msg.html = html_body
            mail.send(msg)
    except Exception as err:
        # The recipient is left out on purpose: it is personal data, and the template, the
        # status and the traceback are what diagnose a transport fault.
        logger.exception(
            "email_send_failed",
            extra={
                "template": template,
                "error_type": type(err).__name__,
                "status_code": getattr(getattr(err, "response", None), "status_code", None),
            },
        )
        record_send_failure()


def record_send_failure() -> None:
    """
    Remember that a send just failed, for `recent_send_failure_count`.

    A failed send is swallowed on purpose (no caller can act on it, and a no-oracle endpoint
    must answer the same whether or not mail went out), which is exactly why something outside
    the request has to be able to see it. Never raises: this runs inside the failure handler.
    """
    now = time.time()
    try:
        pipeline = monitoring_redis().pipeline()
        pipeline.zadd(SEND_FAILURES_KEY, {f"{now}:{uuid.uuid4().hex}": now})
        pipeline.zremrangebyscore(SEND_FAILURES_KEY, 0, now - SEND_FAILURE_WINDOW_SECONDS)
        pipeline.expire(SEND_FAILURES_KEY, SEND_FAILURE_WINDOW_SECONDS)
        pipeline.execute()
    except Exception as error:
        # Broad for the reason SessionService's denylist is: an unavailable Redis is not only
        # RedisError (a malformed URL is a ValueError, a dead socket an OSError), and none of
        # them may turn a swallowed send failure into a failed request.
        logger.warning("email_failure_not_recorded", extra={"error": str(error)})


def recent_send_failure_count() -> Optional[int]:
    """
    How many sends failed in the last `SEND_FAILURE_WINDOW_SECONDS`, or None when the record
    cannot be read — an unreadable record is not the same as a clean one.
    """
    try:
        return int(monitoring_redis().zcount(SEND_FAILURES_KEY, time.time() - SEND_FAILURE_WINDOW_SECONDS, "+inf"))
    except Exception as error:
        logger.warning("email_failure_count_unreadable", extra={"error": str(error)})
        return None
