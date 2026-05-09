import logging

from flask import render_template
from flask_mail import Message

from Api.mail import mail

logger = logging.getLogger(__name__)


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
        msg = Message(subject=subject, recipients=[to])
        msg.body = render_template(f"email/{template}.txt", **ctx)
        msg.html = render_template(f"email/{template}.html", **ctx)
        mail.send(msg)
    except Exception as e:
        logger.error(
            "email_send_failed",
            extra={"to": to, "template": template, "error": str(e)},
        )
