"""Service-level tests for UserService — not-found guards, the keypair flow,
medical-notes guard, and the GDPR deletion-cancel flow that the HTTP-layer
tests do not reach. Uses a fresh-user factory so the session-scoped users
(user_1 / user_2) are never mutated.
"""
import uuid

import pytest
from sqlalchemy.exc import NoResultFound

from Api.database import db
from Models.user import User
from Services.user_service import UserService

_FAKE_UUID = "00000000-0000-7000-8000-0000000000cc"


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
        resp = client.post("/api/auth/register", json={
            "mail": mail, "pwd": pwd, "phone": phone,
            "name": "Svc", "username": username,
        })
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


# ── keypair flow ──────────────────────────────────────────────────────────────

def test_generate_keypair_for_user_backfills_then_rejects_duplicate(make_user):
    u = make_user()
    # Registration already provisions a keypair (M3g); clear it to exercise the
    # backfill path for legacy users created before keypairs existed.
    user = db.session.query(User).filter_by(id=uuid.UUID(u["id"])).first()
    user.public_key = None
    user.private_key_ciphertext = None
    user.private_key_nonce = None
    user.private_key_salt = None
    db.session.commit()

    user = UserService.generate_keypair_for_user(u["id"], u["pwd"])
    assert user.public_key is not None
    assert user.private_key_ciphertext is not None

    # A user who already has a keypair is rejected.
    with pytest.raises(ValueError, match="keypair_already_exists"):
        UserService.generate_keypair_for_user(u["id"], u["pwd"])


def test_generate_keypair_for_user_wrong_password_raises(make_user):
    u = make_user()
    user = db.session.query(User).filter_by(id=uuid.UUID(u["id"])).first()
    user.public_key = None
    db.session.commit()
    with pytest.raises(PermissionError):
        UserService.generate_keypair_for_user(u["id"], "WrongPass9$")


# ── medical notes guard ───────────────────────────────────────────────────────

def test_get_medical_notes_none_stored_raises(make_user):
    u = make_user()
    with pytest.raises(ValueError, match="No medical notes"):
        UserService.get_medical_notes(u["id"], u["pwd"])


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
