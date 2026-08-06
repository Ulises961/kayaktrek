"""HTTP-layer tests for the tidal-station resource — the public /nearby
validation branches and the admin-only create/update/delete CRUD, which need a
real admin user (require_admin reads the DB admin flag).
"""
import uuid

import pytest

from Api.database import db
from Models.user import User
from Services.Middleware.auth_middleware import JWTService
from Tests.auth_helpers import access_token_for

STATION_ENDPOINT = "/api/v1/tidal-station"
_FAKE_UUID = "00000000-0000-7000-8000-000000000111"


def _point(lon, lat):
    return {"type": "Point", "coordinates": [lon, lat]}


@pytest.fixture(scope="function")
def admin_headers(client):
    """Register a fresh user, promote them to admin in the DB, return their headers."""
    suffix = uuid.uuid4().hex[:8]
    mail = f"admin.{suffix}@example.com"
    resp = client.post("/api/v1/auth/register", json={
        "mail": mail, "pwd": "AdminPass9$", "phone": f"+39{uuid.uuid4().int % 10**10:010d}",
        "name": "Admin", "username": f"admin_{suffix}",
    })
    assert resp.status_code == 201
    user = db.session.query(User).filter_by(mail=mail).first()
    user.active = True
    user.admin = True
    db.session.commit()
    uid = str(user.id)
    token = access_token_for(user)

    yield {"Authorization": f"Bearer {token}"}

    user = db.session.query(User).filter_by(id=uuid.UUID(uid)).first()
    if user:
        db.session.delete(user)
        db.session.commit()


@pytest.fixture(scope="function")
def a_station(client, admin_headers):
    resp = client.post(f"{STATION_ENDPOINT}/create", headers=admin_headers,
                       json={"name": "Test Station", "location": _point(-4.1, 50.3),
                             "meanSpringRangeM": 4.0})
    assert resp.status_code == 201
    data = resp.json
    yield data
    client.delete(f"{STATION_ENDPOINT}/{data['id']}", headers=admin_headers)


# ── GET /nearby (public) ─────────────────────────────────────────────────────

def test_nearby_missing_coords_returns_400(client):
    assert client.get(f"{STATION_ENDPOINT}/nearby").status_code == 400


def test_nearby_out_of_range_coords_returns_400(client):
    assert client.get(f"{STATION_ENDPOINT}/nearby?lat=200&lng=10").status_code == 400


def test_nearby_bad_range_returns_400(client):
    assert client.get(f"{STATION_ENDPOINT}/nearby?lat=50&lng=-4&range=500").status_code == 400


def test_nearby_happy_returns_200(client):
    resp = client.get(f"{STATION_ENDPOINT}/nearby?lat=50.3&lng=-4.1&range=5")
    assert resp.status_code == 200
    assert isinstance(resp.json, list)


# ── POST /create (admin) ─────────────────────────────────────────────────────

def test_create_station_as_non_admin_returns_403(client, auth_headers):
    resp = client.post(f"{STATION_ENDPOINT}/create", headers=auth_headers,
                       json={"name": "Nope", "location": _point(-4.1, 50.3)})
    assert resp.status_code == 403


def test_create_station_happy_returns_201(client, a_station):
    assert a_station["name"] == "Test Station"
    assert "id" in a_station


def test_create_station_validation_error_returns_400(client, admin_headers):
    resp = client.post(f"{STATION_ENDPOINT}/create", headers=admin_headers,
                       json={"name": "   ", "location": _point(-4.1, 50.3)})
    assert resp.status_code == 400


def test_create_station_bad_location_returns_400(client, admin_headers):
    resp = client.post(f"{STATION_ENDPOINT}/create", headers=admin_headers,
                       json={"name": "Bad Loc", "location": {"type": "Polygon"}})
    assert resp.status_code == 400


# ── PATCH /<id> (admin) ──────────────────────────────────────────────────────

def test_update_station_happy_returns_200(client, admin_headers, a_station):
    resp = client.patch(f"{STATION_ENDPOINT}/{a_station['id']}", headers=admin_headers,
                        json={"notes": "updated notes"})
    assert resp.status_code == 200
    assert resp.json["notes"] == "updated notes"


def test_update_station_not_found_returns_404(client, admin_headers):
    resp = client.patch(f"{STATION_ENDPOINT}/{_FAKE_UUID}", headers=admin_headers,
                        json={"notes": "x"})
    assert resp.status_code == 404


def test_update_station_validation_error_returns_400(client, admin_headers, a_station):
    resp = client.patch(f"{STATION_ENDPOINT}/{a_station['id']}", headers=admin_headers,
                        json={"meanSpringRangeM": -5})
    assert resp.status_code == 400


# ── DELETE /<id> (admin) ─────────────────────────────────────────────────────

def test_delete_station_not_found_returns_404(client, admin_headers):
    resp = client.delete(f"{STATION_ENDPOINT}/{_FAKE_UUID}", headers=admin_headers)
    assert resp.status_code == 404


def test_delete_station_happy_returns_200(client, admin_headers):
    created = client.post(f"{STATION_ENDPOINT}/create", headers=admin_headers,
                          json={"name": "Doomed", "location": _point(-4.2, 50.4)}).json
    resp = client.delete(f"{STATION_ENDPOINT}/{created['id']}", headers=admin_headers)
    assert resp.status_code == 200

    # The station must actually be gone, not merely a 200 on the route.
    from Models.tidal_station import TidalStation
    assert db.session.get(TidalStation, created["id"]) is None
