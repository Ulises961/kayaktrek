"""
Sender identity in outgoing mail.

Regression guard for a bug that reached production: `support_email` was built at each call
site, and two of them — `Tasks/checkpoint_beat_task.py` and `Services/logistics_service.py`
— passed a hardcoded literal instead of reading config, so the missed-checkpoint alert and
the float-plan share both told recipients to write to `support@kayakplanner.app`, a domain
nobody owns. The seven other call sites used it as a fallback, so they were one unset env
var away from the same thing.

The fix moved resolution into `mail_service._identity_context()`. These tests assert the
property that makes the bug unrepresentable — no email contains an address the operator did
not configure — rather than asserting that any particular call site was edited.
"""

import pathlib
import re

import pytest

from Api.mail import mail
from Services import storage_service
from Services.mail_service import send_template_email

# Every template that renders a footer, i.e. all of them. Kept explicit rather than globbed
# so a new template has to be added here deliberately, and a deleted one fails loudly.
TEMPLATES_AND_CONTEXT = [
    ("account_verification", {"name": "Ada", "verify_url": "https://example.test/v"}),
    ("password_reset", {"name": "Ada", "reset_url": "https://example.test/r"}),
    ("account_already_registered", {"name": "Ada", "forgot_url": "https://example.test/f"}),
    ("email_change_confirm", {"name": "Ada", "confirm_url": "https://example.test/c"}),
    ("email_change_notice", {"name": "Ada", "new_mail": "new@example.test"}),
    ("medical_notes_cleared", {"name": "Ada", "profile_url": "https://example.test/p"}),
    ("deletion_request", {"name": "Ada", "cancel_url": "https://example.test/x"}),
    ("data_export_ready", {"name": "Ada", "download_url": "https://example.test/d"}),
    # The two that carried the hardcoded literal rather than a fallback, so they rendered the
    # wrong address in *every* environment, not only a misconfigured one. Both go to people who
    # are not the account holder — a shore contact and a float-plan recipient — which is why
    # they are the worst two of the set to have got wrong.
    (
        "missed_checkpoint",
        {
            "destination": "Cinque Terre",
            "checkpoint_name": "Day 2",
            "expected_by": "28 Aug 2026, 14:00 UTC",
            "date_label": "28 Aug 2026",
            "crew": [],
            "float_plan_url": "https://example.test/fp",
        },
    ),
    (
        "float_plan_share",
        {
            "leader_name": "Ada",
            "destination": "Cinque Terre",
            "date_label": "28 Aug 2026",
            "float_plan_url": "https://example.test/fp",
        },
    ),
]


@pytest.mark.parametrize("template,ctx", TEMPLATES_AND_CONTEXT)
def test_footer_uses_configured_sender_not_a_literal(app, monkeypatch, template, ctx):
    """The configured sender reaches the footer, and the retired literal appears nowhere."""
    monkeypatch.setitem(app.config, "MAIL_DEFAULT_SENDER", "hello@configured.test")

    with app.app_context(), mail.record_messages() as outbox:
        send_template_email("someone@example.test", "Subject", template, **ctx)

    assert len(outbox) == 1
    for body in (outbox[0].body, outbox[0].html):
        assert "hello@configured.test" in body
        # The specific domain that shipped, and any other unconfigured support address.
        assert "kayakplanner.app" not in body


def test_no_contact_line_when_sender_unconfigured(app, monkeypatch):
    """
    An unset sender renders no address rather than a fake one.

    This is the half that matters: the old code's fallback meant a missing config produced a
    *plausible looking* address, which is worse than none — a recipient writes to it and hears
    nothing back. Silence is the honest failure mode.
    """
    monkeypatch.setitem(app.config, "MAIL_DEFAULT_SENDER", None)

    with app.app_context(), mail.record_messages() as outbox:
        send_template_email(
            "someone@example.test",
            "Subject",
            "account_verification",
            name="Ada",
            verify_url="https://example.test/v",
        )

    html = outbox[0].html
    assert "kayakplanner.app" not in html
    # No mailto: anchor is rendered at all when there is no address to put in it.
    assert "mailto:" not in html


def test_postal_address_is_omitted_unless_configured(app, monkeypatch):
    """Publishing a postal address is opt-in — it must never appear by default."""
    monkeypatch.setitem(app.config, "MAIL_DEFAULT_SENDER", "hello@configured.test")
    monkeypatch.setitem(app.config, "MAIL_POSTAL_ADDRESS", "")

    with app.app_context(), mail.record_messages() as outbox:
        send_template_email(
            "someone@example.test",
            "Subject",
            "account_verification",
            name="Ada",
            verify_url="https://example.test/v",
        )
    assert "Via Example" not in outbox[0].html

    monkeypatch.setitem(app.config, "MAIL_POSTAL_ADDRESS", "Kayaktrek, Via Example 1, 00100 Roma RM, Italy")
    with app.app_context(), mail.record_messages() as outbox:
        send_template_email(
            "someone@example.test",
            "Subject",
            "account_verification",
            name="Ada",
            verify_url="https://example.test/v",
        )
    assert "Via Example 1, 00100 Roma RM, Italy" in outbox[0].html


def test_brand_mark_renders_when_a_public_cdn_base_is_configured(app, monkeypatch):
    """The mark is embedded from the public bucket, and the wordmark survives without it."""
    monkeypatch.setitem(app.config, "MAIL_DEFAULT_SENDER", "hello@configured.test")
    monkeypatch.setattr(storage_service, "_PUBLIC_BASE_URL", "https://cdn.kayaktrek.app")

    with app.app_context(), mail.record_messages() as outbox:
        send_template_email(
            "someone@example.test",
            "Subject",
            "account_verification",
            name="Ada",
            verify_url="https://example.test/v",
        )

    html = outbox[0].html
    assert 'src="https://cdn.kayaktrek.app/brand/mail-mark-96.png"' in html
    # Decorative: the wordmark beside it already names the product, so a matching alt
    # would have a screen reader announce it twice.
    assert 'alt=""' in html
    # And the name is live text, not part of the image — a client that blocks remote
    # images loses the mark and nothing else.
    assert "Kayaktrek" in html


def test_no_image_at_all_without_a_public_cdn_base(app, monkeypatch):
    """
    No CDN base means no `<img>`, not a URL that will 404.

    MinIO scopes anonymous read per *prefix* and `brand/` is not in the policy
    minio-init provisions, so a URL built against the MinIO shape would resolve and
    then 403 — a broken image in every local and pre-migration email. Same
    omit-rather-than-fake rule as the unset sender.
    """
    monkeypatch.setitem(app.config, "MAIL_DEFAULT_SENDER", "hello@configured.test")
    monkeypatch.setattr(storage_service, "_PUBLIC_BASE_URL", "")

    with app.app_context(), mail.record_messages() as outbox:
        send_template_email(
            "someone@example.test",
            "Subject",
            "account_verification",
            name="Ada",
            verify_url="https://example.test/v",
        )

    html = outbox[0].html
    assert "<img" not in html
    assert "Kayaktrek" in html


def test_no_call_site_supplies_its_own_sender_identity():
    """
    Identity is resolved centrally and never passed in by a caller.

    The tests above render templates directly, so they prove `_identity_context()` is right —
    but they would still pass if a call site went back to supplying its own `support_email=`,
    which is exactly how the original bug happened. `send_template_email` merges identity
    *under* `**ctx`, so any such kwarg silently wins. This asserts none exists.

    A source-level check rather than a behavioural one because the property is about the
    shape of the call graph: there is no runtime moment at which "nobody passes this" is
    observable.
    """
    backend_root = pathlib.Path(__file__).resolve().parent.parent
    offenders = []
    for path in backend_root.rglob("*.py"):
        if any(part in {".venv", "Tests", "alembic", "__pycache__"} for part in path.parts):
            continue
        if path.name == "mail_service.py":
            continue  # the one place allowed to name these keys
        for key in ("support_email", "site_url", "postal_address", "logo_url"):
            if re.search(rf"\b{key}\s*=", path.read_text()):
                offenders.append(f"{path.relative_to(backend_root)} passes {key}=")

    assert not offenders, (
        "Sender identity must come from mail_service._identity_context(), not a call site:\n  "
        + "\n  ".join(offenders)
    )


@pytest.mark.parametrize("template,ctx", TEMPLATES_AND_CONTEXT)
def test_product_name_is_current(app, monkeypatch, template, ctx):
    """
    No retired product name survives in a rendered email.

    The app carried three names at once — "Kayak Expedition Planner" in the web UI,
    "Kayak Planner" in every email, "Kayaktrek" on the domain. Mail was the surface that
    drifted furthest, because nothing rendered it in a test.
    """
    monkeypatch.setitem(app.config, "MAIL_DEFAULT_SENDER", "hello@configured.test")

    with app.app_context(), mail.record_messages() as outbox:
        send_template_email("someone@example.test", "Subject", template, **ctx)

    for body in (outbox[0].body, outbox[0].html):
        assert "Kayaktrek" in body
        # Word-boundary so the "sea-kayak expedition planner" descriptor doesn't false-positive.
        assert not re.search(r"\bKayak Planner\b", body)
        assert not re.search(r"\bKayak Expedition Planner\b", body)
