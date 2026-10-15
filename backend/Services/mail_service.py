import logging
from email.utils import parseaddr

import requests
from flask import current_app, render_template
from flask_mail import Message

from Api.mail import mail
from Services import storage_service

logger = logging.getLogger(__name__)

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


def send_template_email(to: str, subject: str, template: str, **ctx) -> None:
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
    except Exception as e:
        logger.error(
            "email_send_failed",
            extra={"to": to, "template": template, "error": str(e)},
        )
