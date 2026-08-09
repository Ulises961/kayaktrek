"""The 404 handler must report why a resource said 404, not assume a routing miss.

A 404 arrives two ways: no route matched the URL, or a handler deliberately called
`abort(404, description=...)` because the thing it was asked for is absent, private,
or blocked. Reporting the endpoint wording for both turns every specific reason into
"you got the URL wrong", which is actively misleading — a caller reads it and goes
looking for a typo that isn't there.
"""
from flask import Flask

from Api.error_handlers import register_error_handlers


def _app() -> Flask:
    app = Flask(__name__)
    register_error_handlers(app)

    @app.route("/deliberate")
    def deliberate():
        from flask import abort

        abort(404, description="Paddler not found, not public, or blocked")

    return app


def test_abort_description_survives_to_the_client():
    """The specific reason reaches the caller instead of being replaced."""
    client = _app().test_client()

    response = client.get("/deliberate")
    body = response.get_json()

    assert response.status_code == 404
    assert body["message"] == "Paddler not found, not public, or blocked"
    # The old wording must not come back — that is the whole regression.
    assert "endpoint" not in body["message"]


def test_unmatched_route_still_says_the_endpoint_is_wrong():
    """A genuine routing miss keeps the endpoint wording, which is accurate there."""
    client = _app().test_client()

    response = client.get("/no-such-route")
    body = response.get_json()

    assert response.status_code == 404
    assert body["message"] == "The requested endpoint does not exist"
    # Werkzeug's own default description must not leak through as the message —
    # it talks about checking your spelling, which is not an API answer.
    assert "spelling" not in body["message"]


def test_error_key_is_stable_across_both_shapes():
    """Clients branch on `error`; only `message` differs between the two cases."""
    client = _app().test_client()

    assert client.get("/deliberate").get_json()["error"] == "Not Found"
    assert client.get("/no-such-route").get_json()["error"] == "Not Found"
