"""
M17 WP0 — the Session table backing per-device revocation.

Covers the two things the model itself is responsible for: the usability window a
refresh must honour, and the ON DELETE CASCADE that keeps GDPR erasure working. The
cascade case is a regression guard for the class of bug PR #92 fixed — a table hanging
off users without an ondelete rule aborts the erasure task for every affected user.
"""
from datetime import datetime, timedelta, timezone
from uuid import UUID

import pytest
from sqlalchemy import text

from Api.database import db
from Models.session import Session
from Models.user import User
from Tasks.session_cleanup_task import purge_dead_sessions

_SESSION_PWD = "SessionPass9$"


def _register_and_activate(app, client, *, mail, phone, username):
    response = client.post("/api/v1/auth/register", json={
        "mail": mail,
        "pwd": _SESSION_PWD,
        "phone": phone,
        "name": "Session",
        "username": username,
    })
    assert response.status_code == 201
    with app.app_context():
        user = User.query.filter_by(mail=mail).first()
        user.active = True
        db.session.commit()
        return str(user.id)


def _add_session(user_id: str, **overrides) -> str:
    session = Session()
    session.user_id = UUID(user_id)
    session.expires_at = datetime.now(timezone.utc) + timedelta(days=30)
    for field, value in overrides.items():
        setattr(session, field, value)
    db.session.add(session)
    db.session.commit()
    return str(session.id)


@pytest.fixture(scope="function")
def session_user(app, client):
    user_id = _register_and_activate(
        app, client,
        mail="session.owner@example.com",
        phone="+39099933301",
        username="m17_session_owner",
    )
    yield user_id
    with app.app_context():
        user = db.session.query(User).filter_by(id=UUID(user_id)).first()
        if user:
            db.session.delete(user)
            db.session.commit()


def test_fresh_session_is_usable(app, session_user):
    with app.app_context():
        session_id = _add_session(session_user)
        session = db.session.get(Session, UUID(session_id))
        assert session.is_usable
        assert session.token_version == 0
        assert session.revoked_at is None


def test_revoked_session_is_not_usable(app, session_user):
    with app.app_context():
        session_id = _add_session(session_user, revoked_at=datetime.now(timezone.utc))
        assert not db.session.get(Session, UUID(session_id)).is_usable


def test_expired_session_is_not_usable(app, session_user):
    with app.app_context():
        session_id = _add_session(
            session_user,
            expires_at=datetime.now(timezone.utc) - timedelta(seconds=1),
        )
        assert not db.session.get(Session, UUID(session_id)).is_usable


def test_deleting_the_user_removes_their_sessions(app, client):
    """Hard-deleting a user must take their sessions with it at the DB level.

    Asserted through a raw SQL DELETE rather than db.session.delete() so the ON DELETE
    CASCADE on the FK is what does the work — the ORM's delete-orphan cascade would
    otherwise mask a missing ondelete rule that Tasks/erasure.py depends on.
    """
    user_id = _register_and_activate(
        app, client,
        mail="session.cascade@example.com",
        phone="+39099933302",
        username="m17_session_cascade",
    )
    with app.app_context():
        _add_session(user_id)
        _add_session(user_id)
        assert db.session.query(Session).filter_by(user_id=UUID(user_id)).count() == 2

        db.session.execute(text("DELETE FROM users WHERE id = :id"), {"id": user_id})
        db.session.commit()

        assert db.session.query(Session).filter_by(user_id=UUID(user_id)).count() == 0


# =============================================================================
# Cleanup task (WP D)
# =============================================================================

def test_purge_collects_only_long_dead_sessions(app, session_user):
    with app.app_context():
        live = _add_session(session_user)
        recently_revoked = _add_session(
            session_user, revoked_at=datetime.now(timezone.utc) - timedelta(days=2)
        )
        just_expired = _add_session(
            session_user, expires_at=datetime.now(timezone.utc) - timedelta(days=2)
        )
        long_revoked = _add_session(
            session_user, revoked_at=datetime.now(timezone.utc) - timedelta(days=45)
        )
        long_expired = _add_session(
            session_user, expires_at=datetime.now(timezone.utc) - timedelta(days=45)
        )

        assert purge_dead_sessions() == 2

        surviving = {
            str(session.id)
            for session in db.session.query(Session).filter_by(user_id=UUID(session_user)).all()
        }
        # Recently dead rows are kept on purpose — they are the evidence behind
        # "why was I signed out on that device?".
        assert surviving == {live, recently_revoked, just_expired}
        assert long_revoked not in surviving
        assert long_expired not in surviving
