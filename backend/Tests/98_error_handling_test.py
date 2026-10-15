"""Central error handling — what a resource gets for free by letting an error propagate.

`coding-rules` tells resources not to catch `Exception` and `abort(500)`: the handlers in
`Api/error_handlers.py` already return a generic body, log the traceback and roll the session
back. These tests hold the handlers to that, on a minimal app so no database is involved.
"""
import logging
from unittest.mock import MagicMock

import pytest
from flask import Flask, abort

from Api.error_handlers import register_error_handlers

GENERIC_500 = {"error": "Internal Server Error", "message": "An unexpected error occurred"}


@pytest.fixture
def error_app(monkeypatch):
    database = MagicMock()
    monkeypatch.setattr("Api.error_handlers.db", database)
    app = Flask(__name__)
    register_error_handlers(app)

    @app.route("/boom")
    def boom():
        raise RuntimeError("secret internals")

    @app.route("/refused")
    def refused():
        raise PermissionError("Only the trip leader can do that")

    @app.route("/refused-silently")
    def refused_silently():
        raise PermissionError()

    @app.route("/os-denied")
    def os_denied():
        raise PermissionError(13, "Permission denied", "/var/lib/kayak/private.key")

    @app.route("/ok")
    def ok():
        return {"status": "fine"}

    @app.route("/conflict")
    def conflict():
        abort(409, description="Already exists")

    @app.route("/bad-value")
    def bad_value():
        raise ValueError("not a number")

    @app.route("/created")
    def created():
        return {"id": 1}, 201

    return app, database


def _logged_exceptions(caplog):
    return [record.exc_info[1] for record in caplog.records if record.exc_info]


def test_an_unexpected_error_is_a_generic_500_that_hides_its_cause(error_app):
    app, _ = error_app

    response = app.test_client().get("/boom")

    assert response.status_code == 500
    assert response.get_json() == GENERIC_500
    assert "secret internals" not in response.get_data(as_text=True)


def test_an_unexpected_error_logs_its_traceback_and_rolls_the_session_back(error_app, caplog):
    app, database = error_app

    with caplog.at_level(logging.ERROR, logger="Api.error_handlers"):
        app.test_client().get("/boom")

    raised = _logged_exceptions(caplog)
    assert [type(error) for error in raised] == [RuntimeError]
    assert str(raised[0]) == "secret internals"
    database.session.rollback.assert_called()


def test_a_service_refusal_is_a_403_carrying_its_message(error_app):
    app, _ = error_app

    response = app.test_client().get("/refused")

    assert response.status_code == 403
    assert response.get_json() == {"error": "Forbidden", "message": "Only the trip leader can do that"}


def test_a_refusal_without_a_message_still_says_something(error_app):
    app, _ = error_app

    response = app.test_client().get("/refused-silently")

    assert response.status_code == 403
    assert response.get_json()["message"] == "Access denied"


@pytest.mark.parametrize(
    "path, status",
    [
        ("/conflict", 409),  # a resource's own abort
        ("/bad-value", 400),  # a service error mapped centrally
        ("/boom", 500),  # an unexpected error
        ("/refused", 403),
        ("/no-such-route", 404),
    ],
)
def test_every_error_response_discards_the_requests_uncommitted_work(error_app, path, status):
    app, database = error_app

    response = app.test_client().get(path)

    assert response.status_code == status
    database.session.rollback.assert_called()


@pytest.mark.parametrize("path", ["/ok", "/created"])
def test_a_successful_response_is_not_rolled_back(error_app, path):
    app, database = error_app

    response = app.test_client().get(path)

    assert response.status_code < 400
    database.session.rollback.assert_not_called()


def test_a_real_resource_lets_an_unexpected_error_reach_the_central_handler(client, monkeypatch, caplog):
    """Item categories is public, so no login is needed; the schema blowing up stands in for any
    bug in a resource. A resource that caught it would log a message with no traceback."""

    class ExplodingSchema:
        def __init__(self, *args, **kwargs):
            pass

        def dump(self, *args, **kwargs):
            raise RuntimeError("boom from the schema")

    monkeypatch.setattr("Resources.item_category_resource.ItemCategorySchema", ExplodingSchema)

    with caplog.at_level(logging.ERROR, logger="Api.error_handlers"):
        response = client.get("/api/v1/item-categories")

    assert response.status_code == 500
    assert response.get_json() == GENERIC_500
    assert [str(error) for error in _logged_exceptions(caplog)] == ["boom from the schema"]


def test_an_operating_system_permission_error_is_not_a_403_and_leaks_no_path(error_app, caplog):
    app, database = error_app

    with caplog.at_level(logging.ERROR, logger="Api.error_handlers"):
        response = app.test_client().get("/os-denied")

    assert response.status_code == 500
    assert response.get_json() == GENERIC_500
    assert "/var/lib/kayak" not in response.get_data(as_text=True)
    assert [type(error) for error in _logged_exceptions(caplog)] == [PermissionError]
    database.session.rollback.assert_called()
