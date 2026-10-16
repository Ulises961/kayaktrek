"""Every test-client request runs in its own app context, as in production.

The suite keeps one app context pushed for the whole session so fixtures can use `db.session`
directly. Flask reuses a context already on the stack, so before `PerRequestContextClient` every
request shared it: `flask.g` carried one request's `current_user_id` into the next, which let an
"anonymous caller must not see this" assertion pass off a leftover identity (found 2026-06-10),
and every request shared one SQLAlchemy session and its identity map.

These tests use a small app of their own so they can show the leak with the plain client as well
as its absence with the isolated one. A test that passes under both would prove nothing.
"""
from typing import Any

import pytest
from flask import Flask, g, jsonify
from flask.testing import FlaskClient
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import text

from Tests.isolated_client import PerRequestContextClient


@pytest.fixture
def mini_app():
    """A throwaway app with a pushed context, mirroring what the `app` fixture does."""
    app = Flask(__name__)
    app.config.update(SQLALCHEMY_DATABASE_URI="sqlite://", TESTING=True)
    database = SQLAlchemy(app)
    # Held for the whole test: a session freed after its request could have its id reused.
    request_sessions: list[Any] = []

    @app.post("/set-user")
    def set_user():
        g.current_user_id = "someone-else"
        return "", 204

    @app.get("/read-user")
    def read_user():
        return jsonify(user=g.get("current_user_id"))

    @app.get("/session")
    def session_probe():
        request_sessions.append(database.session())
        return "", 204

    with app.app_context():
        yield app, database, request_sessions


def test_plain_client_leaks_g_between_requests(mini_app):
    app, _, _ = mini_app
    client = app.test_client()

    client.post("/set-user")

    assert client.get("/read-user").json == {"user": "someone-else"}


def test_isolated_client_does_not_leak_g_between_requests(mini_app):
    app, _, _ = mini_app
    app.test_client_class = PerRequestContextClient
    client = app.test_client()

    client.post("/set-user")

    assert client.get("/read-user").json == {"user": None}


def test_each_request_gets_its_own_db_session(mini_app):
    app, database, request_sessions = mini_app
    app.test_client_class = PerRequestContextClient
    client = app.test_client()

    client.get("/session")
    client.get("/session")

    first, second = request_sessions
    assert first is not second
    assert first is not database.session()
    assert second is not database.session()


def test_plain_client_shares_one_db_session_across_requests(mini_app):
    app, database, request_sessions = mini_app
    client = app.test_client()

    client.get("/session")
    client.get("/session")

    first, second = request_sessions
    assert first is second is database.session()


def test_isolated_client_ends_the_test_bodys_transaction_before_a_request(mini_app):
    app, database, _ = mini_app
    app.test_client_class = PerRequestContextClient
    client = app.test_client()
    database.session.execute(text("SELECT 1"))
    assert database.session().in_transaction()

    client.get("/read-user")

    assert not database.session().in_transaction()


def test_plain_client_leaves_the_test_bodys_transaction_open(mini_app):
    app, database, _ = mini_app
    client = app.test_client()
    database.session.execute(text("SELECT 1"))

    client.get("/read-user")

    assert database.session().in_transaction()


def test_suite_client_is_the_isolated_one(client: FlaskClient):
    """Guards the wiring in conftest.py: dropping `app.test_client_class` fails here."""
    assert isinstance(client, PerRequestContextClient)
