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
from flask import Flask, Response, g, has_request_context, jsonify, stream_with_context
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

    @app.get("/stream")
    def stream():
        # The shape of the live routes: a generator kept inside its request by
        # stream_with_context, so the request stays open until the stream is finished.
        def chunks():
            yield "retry: 5000\n\n"
            yield "event: snapshot\n\n"

        return Response(stream_with_context(chunks()), mimetype="text/event-stream")

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


# A streamed response keeps its request context pushed until the stream is finished. Tests that
# check only the status of one and never read it left that context on the stack, to be popped
# whenever the garbage collector finalised the response: during some later, unrelated test, which
# tore down the worker's session and detached the shared `user_1` for the rest of the run. It
# showed only on slower runners, where the collection landed at a different moment.
def test_plain_client_leaves_a_streamed_request_context_pushed_until_it_is_closed(mini_app):
    app, _, _ = mini_app
    client = app.test_client()

    response = client.get("/stream")

    try:
        assert has_request_context()
    finally:
        response.close()
    assert not has_request_context()


def test_isolated_client_finishes_a_streamed_response_it_was_never_asked_to_read(mini_app):
    app, _, _ = mini_app
    app.test_client_class = PerRequestContextClient
    client = app.test_client()

    response = client.get("/stream")

    try:
        assert not has_request_context()
        assert response.status_code == 200
        assert "event: snapshot" in response.get_data(as_text=True)
    finally:
        response.close()


def test_suite_client_is_the_isolated_one(client: FlaskClient):
    """Guards the wiring in conftest.py: dropping `app.test_client_class` fails here."""
    assert isinstance(client, PerRequestContextClient)
