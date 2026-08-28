import logging

from flask import current_app, render_template
from flask_mail import Message

from Api.mail import mail
from Services import storage_service

logger = logging.getLogger(__name__)

# Object key of the rasterised brand mark in the public bucket. Written by
# scripts/build-mail-mark.sh; the committed copy is docs/brand/mail-mark-96.png.
MAIL_MARK_KEY = "brand/mail-mark-96.png"


def _identity_context() -> dict[str, str]:
    """
    The sender-identity block every footer renders, resolved from config in one place.

    Call sites used to each build `support_email` themselves, and two of them
    (`checkpoint_beat_task`, `logistics_service`) hardcoded a literal rather than
    reading config at all — so the missed-checkpoint alert and the float-plan share
    told recipients to write to a domain nobody owns. Resolving it here means a call
    site cannot get it wrong by omission, and there is no fallback literal to go
    stale: an unset sender renders nothing rather than something false.

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


def send_template_email(to: str, subject: str, template: str, **ctx) -> None:
    """
    Render and send a dual-part (plain text + HTML) email from templates.

    Templates are resolved from templates/email/<template>.txt and
    templates/email/<template>.html. Both parts are sent so the recipient's
    client chooses whichever it prefers.

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
        msg = Message(subject=subject, recipients=[to])
        msg.body = render_template(f"email/{template}.txt", **ctx)
        msg.html = render_template(f"email/{template}.html", **ctx)
        mail.send(msg)
    except Exception as e:
        logger.error(
            "email_send_failed",
            extra={"to": to, "template": template, "error": str(e)},
        )
