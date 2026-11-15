"""
`3b9c1d72a4e8` lower-cases every stored address and then adds a unique index on `lower(mail)`.
It runs once against live user rows, and a wrong guess there either merges two people's accounts
or locks someone out, so it is run here against real rows rather than trusted on the day.

The migration is loaded by path because `alembic/versions/` is not an importable package. It runs
inside the test's own transaction, so the index it drops and recreates comes back on rollback.
"""
import importlib.util
import uuid
from pathlib import Path

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import text

from Api.database import db
from Models.user import User

_MIGRATION = (
    Path(__file__).resolve().parents[1] / "alembic" / "versions" / "3b9c1d72a4e8_normalise_user_mail_case.py"
)


def _load():
    spec = importlib.util.spec_from_file_location("_mail_case_migration", _MIGRATION)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


migration = _load()


def _user(mail_addr, pending_mail=None):
    suffix = uuid.uuid4().hex[:8]
    user = User(pwd="Migrate9$", mail=mail_addr, pending_mail=pending_mail, username=f"mig_{suffix}", name="Mig")
    db.session.add(user)
    return user


def _run_upgrade():
    connection = db.session.connection()
    with Operations.context(MigrationContext.configure(connection)):
        migration.upgrade()


@pytest.fixture
def without_the_index(app):
    """The test schema is built from the models, so the index already exists; the migration
    is what creates it, so start from the state it runs against. Rolled back afterwards."""
    db.session.rollback()
    db.session.execute(text("DROP INDEX uq_users_mail_lower"))
    yield
    db.session.rollback()


def test_lowercases_and_trims_addresses_and_pending_addresses(app, without_the_index):
    suffix = uuid.uuid4().hex[:8]
    user = _user(f"  Mixed_{suffix}@Example.COM", pending_mail=f"New_{suffix}@Example.COM")
    already_clean = _user(f"clean_{suffix}@example.com")
    db.session.flush()

    _run_upgrade()
    db.session.refresh(user)
    db.session.refresh(already_clean)

    assert user.mail == f"mixed_{suffix}@example.com"
    assert user.pending_mail == f"new_{suffix}@example.com"
    assert already_clean.mail == f"clean_{suffix}@example.com"
    assert already_clean.pending_mail is None


def test_the_index_it_adds_refuses_a_second_spelling(app, without_the_index):
    suffix = uuid.uuid4().hex[:8]
    _user(f"one_{suffix}@example.com")
    db.session.flush()
    _run_upgrade()

    _user(f"ONE_{suffix}@example.com")
    with pytest.raises(Exception, match="uq_users_mail_lower"):
        db.session.flush()


def test_refuses_to_merge_two_accounts_and_changes_nothing(app, without_the_index):
    suffix = uuid.uuid4().hex[:8]
    upper = _user(f"Same_{suffix}@Example.com")
    lower = _user(f"same_{suffix}@example.com")
    db.session.flush()

    with pytest.raises(RuntimeError, match="would merge accounts"):
        _run_upgrade()
    db.session.refresh(upper)
    db.session.refresh(lower)

    assert upper.mail == f"Same_{suffix}@Example.com"
    assert lower.mail == f"same_{suffix}@example.com"
    assert db.session.execute(text("SELECT count(*) FROM pg_indexes WHERE indexname = 'uq_users_mail_lower' AND schemaname = current_schema()")).scalar_one() == 0


def test_downgrade_drops_only_the_index(app, without_the_index):
    suffix = uuid.uuid4().hex[:8]
    user = _user(f"keep_{suffix}@example.com")
    db.session.flush()
    _run_upgrade()

    connection = db.session.connection()
    with Operations.context(MigrationContext.configure(connection)):
        migration.downgrade()
    db.session.refresh(user)

    assert user.mail == f"keep_{suffix}@example.com"
    assert db.session.execute(text("SELECT count(*) FROM pg_indexes WHERE indexname = 'uq_users_mail_lower' AND schemaname = current_schema()")).scalar_one() == 0
