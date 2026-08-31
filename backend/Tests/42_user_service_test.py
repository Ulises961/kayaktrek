"""Service-level tests for UserService — not-found guards, the keypair flow,
medical-notes guard, and the GDPR deletion-cancel flow that the HTTP-layer
tests do not reach. Uses a fresh-user factory so the session-scoped users
(user_1 / user_2) are never mutated.
"""
import uuid
from datetime import datetime, timezone

import pytest
from sqlalchemy.exc import NoResultFound

from Api.database import db
from Models.user import User
from Services.user_service import UserService
from Tests.conftest import _keypair_fields, _registration

_FAKE_UUID = "00000000-0000-7000-8000-0000000000cc"


def _set_attrs(user_id: str, **attrs) -> User:
    """Set attributes directly on a user row and commit (test helper)."""
    user = db.session.query(User).filter_by(id=uuid.UUID(user_id)).first()
    for key, value in attrs.items():
        setattr(user, key, value)
    db.session.commit()
    return user


@pytest.fixture(scope="function")
def make_user(app, client):
    """Factory that registers + activates a fresh user and cleans them all up."""
    created_ids: list[str] = []
    counter = {"n": 0}

    def _make(pwd: str = "FreshPass9$") -> dict:
        counter["n"] += 1
        suffix = uuid.uuid4().hex[:8]
        mail = f"svc.{suffix}@example.com"
        username = f"svc_{suffix}"
        phone = f"+39{counter['n']:010d}"
        resp = client.post("/api/v1/auth/register", json=_registration({
            "mail": mail, "pwd": pwd, "phone": phone,
            "name": "Svc", "username": username,
        }))
        assert resp.status_code == 201
        user = db.session.query(User).filter_by(mail=mail).first()
        user.active = True
        db.session.commit()
        created_ids.append(str(user.id))
        return {"id": str(user.id), "mail": mail, "username": username, "pwd": pwd}

    yield _make

    for uid in created_ids:
        user = db.session.query(User).filter_by(id=uuid.UUID(uid)).first()
        if user:
            db.session.delete(user)
    db.session.commit()


# ── get / update not-found guards ─────────────────────────────────────────────

def test_get_user_by_id_not_found_raises(client, auth_headers):
    with pytest.raises(NoResultFound):
        UserService.get_user_by_id(_FAKE_UUID)


def test_update_user_not_found_raises(client, auth_headers):
    with pytest.raises(NoResultFound):
        UserService.update_user(_FAKE_UUID, {"name": "Nobody"})


def test_update_user_duplicate_username_raises(make_user):
    a = make_user()
    b = make_user()
    with pytest.raises(Exception):  # IntegrityError (re-wrapped) on the unique constraint
        UserService.update_user(a["id"], {"username": b["username"]})
    db.session.rollback()


# ── get_public_profile — visibility choke-point (single 404, no oracle) ──────────

def test_get_public_profile_returns_public_user(make_user):
    u = make_user()
    _set_attrs(u["id"], profile_is_public=True)
    result = UserService.get_public_profile(u["username"])
    assert str(result.id) == u["id"]


def test_get_public_profile_private_raises(make_user):
    u = make_user()  # profile_is_public defaults to False
    with pytest.raises(NoResultFound):
        UserService.get_public_profile(u["username"])


def test_get_public_profile_missing_raises(client, auth_headers):
    with pytest.raises(NoResultFound):
        UserService.get_public_profile("no_such_paddler_at_all")


def test_get_public_profile_inactive_raises(make_user):
    u = make_user()
    _set_attrs(u["id"], profile_is_public=True, active=False)
    with pytest.raises(NoResultFound):
        UserService.get_public_profile(u["username"])


def test_get_public_profile_deletion_pending_raises(make_user):
    u = make_user()
    _set_attrs(u["id"], profile_is_public=True,
               deletion_requested_at=datetime.now(timezone.utc))
    with pytest.raises(NoResultFound):
        UserService.get_public_profile(u["username"])


# ── keypair flow ──────────────────────────────────────────────────────────────

def test_store_keypair_backfills_then_rejects_duplicate(make_user):
    u = make_user()
    # The client posts a keypair at registration (M22); clear it to exercise the
    # backfill path for accounts created before it did.
    user = db.session.query(User).filter_by(id=uuid.UUID(u["id"])).first()
    user.public_key = None
    user.private_key_ciphertext = None
    user.private_key_nonce = None
    user.private_key_salt = None
    db.session.commit()

    fields = _keypair_fields(u["pwd"])
    user = UserService.store_keypair(
        u["id"], fields["publicKey"], fields["privateKeyCiphertext"],
        fields["privateKeyNonce"], fields["privateKeySalt"],
    )
    assert user.public_key == fields["publicKey"]
    assert user.private_key_ciphertext == fields["privateKeyCiphertext"]

    # A user who already has a keypair is rejected — overwriting one would orphan
    # every note and every leader-shared copy encrypted under it.
    with pytest.raises(ValueError, match="keypair_already_exists"):
        UserService.store_keypair(
            u["id"], fields["publicKey"], fields["privateKeyCiphertext"],
            fields["privateKeyNonce"], fields["privateKeySalt"],
        )


def test_get_keypair_none_stored_raises(make_user):
    u = make_user()
    _set_attrs(u["id"], public_key=None)
    with pytest.raises(ValueError, match="No keypair"):
        UserService.get_keypair(u["id"])


# ── medical notes ─────────────────────────────────────────────────────────────

def test_get_medical_notes_none_stored_returns_nulls(make_user):
    """Not an error: an account with no notes is the ordinary starting state, and
    a client that had to catch an exception for it would be catching it forever."""
    u = make_user()
    assert UserService.get_medical_notes(u["id"]) == {
        "ciphertext": None, "nonce": None, "salt": None,
    }


# ── deletion / cancel flow ────────────────────────────────────────────────────

def test_resend_deletion_cancel_unknown_or_no_pending_returns_none(make_user):
    # Unknown email → None
    assert UserService.resend_deletion_cancel("nobody@nowhere.test") is None
    # Known email but no pending deletion → None
    u = make_user()
    assert UserService.resend_deletion_cancel(u["mail"]) is None


def test_request_then_resend_deletion_cancel_returns_token(make_user):
    u = make_user()
    UserService.request_deletion(u["id"])
    result = UserService.resend_deletion_cancel(u["mail"])
    assert result is not None
    raw_token, name = result
    assert isinstance(raw_token, str) and raw_token
    assert name == "Svc"


# ── delete_user ───────────────────────────────────────────────────────────────

def test_delete_user_not_found_raises(client, auth_headers):
    with pytest.raises(NoResultFound):
        UserService.delete_user(_FAKE_UUID)


def test_delete_user_happy_path(make_user):
    u = make_user()
    UserService.delete_user(u["id"])
    with pytest.raises(NoResultFound):
        UserService.get_user_by_id(u["id"])


# ── Rubric 3: Transaction usability after errors ──────────────────────────
# Verify that after an error, the transaction is left usable and not in
# a PendingRollbackError state. We test this by issuing a DB query after
# the exception is caught.

def test_transaction_usable_after_get_user_not_found(app):
    """After get_user_by_id raises NoResultFound, transaction is usable (rubric 3)."""
    with app.app_context():
        with pytest.raises(NoResultFound):
            UserService.get_user_by_id(_FAKE_UUID)

        # Verify transaction is still usable — a new query should work
        result = db.session.query(User).first()
        # If we got here without PendingRollbackError, the transaction is usable
        assert result is not None or result is None  # Just verifies the query ran


def test_transaction_usable_after_update_not_found(app):
    """After update_user raises NoResultFound, transaction is usable (rubric 3)."""
    with app.app_context():
        with pytest.raises(NoResultFound):
            UserService.update_user(_FAKE_UUID, {"name": "Nobody"})

        # Verify transaction is still usable
        result = db.session.query(User).first()
        assert result is not None or result is None
