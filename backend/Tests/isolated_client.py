"""A test client that gives every request its own app context, as production does.

Kept out of conftest.py for the reason auth_helpers.py gives: conftest is imported by pytest
under its own module name, and importing it a second time by path would run it twice.
"""
from typing import Any

from flask.testing import FlaskClient
from werkzeug.test import TestResponse


class PerRequestContextClient(FlaskClient):
    """Runs each request in a fresh app context, so `g` and the DB session cannot leak between them.

    The `app` fixture keeps one app context pushed for the whole session so fixtures and test
    bodies can use `db.session` directly. Flask reuses a context already on the stack for the
    same app, so every request would share it, and with it `flask.g` and the SQLAlchemy session
    (Flask-SQLAlchemy scopes the session to the app context). Production gets a fresh context per
    request. Pushing one around `open` makes the request take it, and popping it tears down `g`
    and the request's session exactly as a real request ending does.

    The request's session is a different one from the test body's, so the body's transaction is
    rolled back first. Left open (a read, or the aftermath of an expected exception) it would hold
    row locks the request waits on forever, and uncommitted work would be invisible to the request
    as it would be to a real second connection. Rolling back also expires what the body holds, so
    its next read sees what the request committed. A test that adds rows and relies on the request
    seeing them must commit, exactly as production data has been committed before a request reads it.
    """

    def open(self, *args: Any, **kwargs: Any) -> TestResponse:
        self.application.extensions["sqlalchemy"].session.rollback()
        with self.application.app_context():
            return super().open(*args, **kwargs)
