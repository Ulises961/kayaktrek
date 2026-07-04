"""M11 §4 — GET /api/v1/health liveness/readiness probe."""
from unittest.mock import patch


def test_health_returns_ok_with_no_auth(client):
    r = client.get("/api/v1/health")
    assert r.status_code == 200
    assert r.get_json() == {"status": "ok"}


def test_health_returns_503_when_db_unreachable(client):
    with patch("Resources.health_resource.db.session.execute", side_effect=Exception("db down")):
        r = client.get("/api/v1/health")
    assert r.status_code == 503
    assert r.get_json() == {"status": "error"}
