from openapi_spec_validator import validate


def test_openapi_json_returns_a_valid_spec(client):
    res = client.get("/api/v1/openapi.json")
    assert res.status_code == 200

    spec = res.get_json()
    validate(spec)  # raises if the document doesn't conform to the OpenAPI 3.x schema


def test_openapi_json_covers_every_registered_blueprint(client):
    spec = client.get("/api/v1/openapi.json").get_json()
    paths = spec["paths"]

    assert "/api/v1/trip/{id}" in paths
    assert "/api/v1/live/trip/{id}/stream" in paths
    assert "/api/v1/tiles/{layer}/{z}/{x}/{y}.png" in paths
    assert "/api/v1/itinerary/{id}" in paths

    # Dev-only routes (404 outside DEVELOPMENT) aren't part of the public contract.
    assert not any(path.startswith("/api/v1/dev") for path in paths)


def test_openapi_json_maps_auth_requirement_from_the_real_decorator_stack(client):
    spec = client.get("/api/v1/openapi.json").get_json()
    paths = spec["paths"]

    assert "security" in paths["/api/v1/trip/{id}"]["get"]
    assert "security" not in paths["/api/v1/auth/login"]["post"]
    assert "security" not in paths["/api/v1/health"]["get"]

    assert spec["components"]["securitySchemes"]["bearerAuth"] == {
        "type": "http",
        "scheme": "bearer",
        "bearerFormat": "JWT",
    }


def test_docs_ui_is_served(client):
    """Verify that the Swagger UI documentation page is served and loaded with the spec."""
    res = client.get("/api/v1/docs/")
    assert res.status_code == 200
    # Check for Swagger UI content in the response
    assert b"swagger" in res.data.lower()
    # Verify it's HTML (contains common HTML tags)
    assert b"<!DOCTYPE" in res.data or b"<html" in res.data.lower()
    # Verify the page references the OpenAPI spec endpoint
    assert b"/api/v1/openapi.json" in res.data or b"openapi.json" in res.data


def test_servers_url_plus_path_resolves_to_a_real_route(app, client):
    """Regression guard: `servers` was once `/api/v1`, but every path key already carries the
    full `/api/v1/...` prefix (FlaskPlugin derives it from the Flask rule's own rule.rule,
    which includes the blueprint's url_prefix) — concatenating servers.url + path the way
    Swagger UI/Postman do produced /api/v1/api/v1/... and a real 404 on every generated
    request. Caught live via a genuine login attempt through the imported spec."""
    spec = client.get("/api/v1/openapi.json").get_json()
    server_url = spec["servers"][0]["url"]
    path = "/api/v1/auth/login"
    assert path in spec["paths"]

    composed = (server_url.rstrip("/") + path) or path
    assert "/api/v1/api/v1" not in composed

    adapter = app.url_map.bind("localhost")
    endpoint, _ = adapter.match(composed, method="POST")
    assert endpoint == "auth.login_user"
