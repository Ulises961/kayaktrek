"""M4e §2 — HTTP layer for map places: create (itinerary-scoped, any trip member),
list / range / get, and creator-only patch/delete, plus the seeded category catalogue
and the admin-only category create endpoint."""
import uuid
from uuid import uuid4

import pytest

from Api.database import db
from Models.place_category import PlaceCategory
from Models.user import User
from Services.Middleware.auth_middleware import JWTService

PLACE_BASE = "/api/v1/place"
CATEGORIES = "/api/v1/place-categories"


@pytest.fixture(scope="function")
def admin_headers(client):
    """Register a fresh user, promote them to admin in the DB, return their headers."""
    suffix = uuid.uuid4().hex[:8]
    mail = f"place.admin.{suffix}@example.com"
    resp = client.post("/api/v1/auth/register", json={
        "mail": mail, "pwd": "AdminPass9$", "phone": f"+39{uuid.uuid4().int % 10**10:010d}",
        "name": "Admin", "username": f"place_admin_{suffix}",
    })
    assert resp.status_code == 201
    user = db.session.query(User).filter_by(mail=mail).first()
    user.active = True
    user.admin = True
    db.session.commit()
    uid = str(user.id)
    token = JWTService.generate_access_token(user.id, user.mail, True, user.token_version)

    yield {"Authorization": f"Bearer {token}"}

    user = db.session.query(User).filter_by(id=uuid.UUID(uid)).first()
    if user:
        db.session.delete(user)
        db.session.commit()


def _body(itinerary, place_category_ids, **overrides):
    body = {
        "itineraryId": itinerary["id"],
        "location": {"type": "Point", "coordinates": [-4.1, 50.3]},
        "categoryId": place_category_ids["freshwater"],
        "label": "Stream by the beach",
    }
    body.update(overrides)
    return body


def _create(client, headers, itinerary, place_category_ids, **overrides):
    return client.post(
        f"{PLACE_BASE}/create",
        json=_body(itinerary, place_category_ids, **overrides),
        headers=headers,
    )


# ── categories ───────────────────────────────────────────────────────────────

def test_categories_returns_seeded_catalogue(client, auth_headers):
    resp = client.get(CATEGORIES, headers=auth_headers)
    assert resp.status_code == 200
    by_slug = {c["slug"]: c for c in resp.get_json()}
    assert "freshwater" in by_slug
    assert by_slug["freshwater"]["icon"] == "droplet"


def test_categories_requires_auth(client):
    assert client.get(CATEGORIES).status_code in (401, 403)


# ── create category (admin only) ─────────────────────────────────────────────

def _cleanup_category(slug):
    row = db.session.query(PlaceCategory).filter_by(slug=slug).first()
    if row:
        db.session.delete(row)
        db.session.commit()


def test_create_category_as_admin_returns_201(client, admin_headers):
    slug = f"sea_cave_{uuid4().hex[:6]}"
    try:
        resp = client.post(CATEGORIES, headers=admin_headers,
                           json={"slug": slug, "name": "Sea Cave", "icon": "waves"})
        assert resp.status_code == 201
        data = resp.get_json()
        assert data["slug"] == slug
        assert data["name"] == "Sea Cave"
        assert data["icon"] == "waves"
        # The new category is now in the catalogue any member reads.
        listed = client.get(CATEGORIES, headers=admin_headers).get_json()
        assert slug in {c["slug"] for c in listed}
    finally:
        _cleanup_category(slug)


def test_create_category_normalises_slug_and_strips_name(client, admin_headers):
    slug = f"Tide_Race_{uuid4().hex[:6]}"
    try:
        resp = client.post(CATEGORIES, headers=admin_headers,
                           json={"slug": slug, "name": "  <b>Tide Race</b>  "})
        assert resp.status_code == 201
        data = resp.get_json()
        assert data["slug"] == slug.lower()
        assert data["name"] == "Tide Race"
    finally:
        _cleanup_category(slug.lower())


def test_create_category_non_admin_returns_403(client, auth_headers_2):
    resp = client.post(CATEGORIES, headers=auth_headers_2,
                       json={"slug": "nope", "name": "Nope"})
    assert resp.status_code == 403


def test_create_category_requires_auth(client):
    resp = client.post(CATEGORIES, json={"slug": "nope", "name": "Nope"})
    assert resp.status_code in (401, 403)


def test_create_category_duplicate_slug_returns_409(client, admin_headers):
    # "freshwater" is seeded, so a second one trips the unique constraint.
    resp = client.post(CATEGORIES, headers=admin_headers,
                       json={"slug": "freshwater", "name": "Fresh Water 2"})
    assert resp.status_code == 409


def test_create_category_invalid_slug_returns_400(client, admin_headers):
    resp = client.post(CATEGORIES, headers=admin_headers,
                       json={"slug": "Not A Slug!", "name": "Bad"})
    assert resp.status_code == 400


def test_create_category_empty_name_returns_400(client, admin_headers):
    resp = client.post(CATEGORIES, headers=admin_headers,
                       json={"slug": "blank_name", "name": "   "})
    assert resp.status_code == 400


# ── create ───────────────────────────────────────────────────────────────────

def test_create_returns_201_with_nested_category(client, auth_headers, itinerary, place_category_ids):
    resp = _create(client, auth_headers, itinerary, place_category_ids)
    assert resp.status_code == 201
    data = resp.get_json()
    assert data["id"]
    assert data["label"] == "Stream by the beach"
    assert data["location"] == {"type": "Point", "coordinates": [-4.1, 50.3]}
    assert data["category"]["slug"] == "freshwater"
    assert data["visibility"] == "private"


def test_create_sanitizes_label(client, auth_headers, itinerary, place_category_ids):
    resp = _create(client, auth_headers, itinerary, place_category_ids,
                   label="  <b>Cave</b>  ")
    assert resp.status_code == 201
    assert resp.get_json()["label"] == "Cave"


def test_create_empty_label_returns_400(client, auth_headers, itinerary, place_category_ids):
    resp = _create(client, auth_headers, itinerary, place_category_ids, label="   ")
    assert resp.status_code == 400


def test_create_missing_itinerary_id_returns_400(client, auth_headers, itinerary, place_category_ids):
    body = _body(itinerary, place_category_ids)
    del body["itineraryId"]
    assert client.post(f"{PLACE_BASE}/create", json=body, headers=auth_headers).status_code == 400


def test_create_on_unowned_itinerary_returns_403(client, auth_headers_2, itinerary, place_category_ids):
    assert _create(client, auth_headers_2, itinerary, place_category_ids).status_code == 403


def test_create_requires_auth(client, itinerary, place_category_ids):
    resp = client.post(f"{PLACE_BASE}/create", json=_body(itinerary, place_category_ids))
    assert resp.status_code in (401, 403)


# ── list / get / range ───────────────────────────────────────────────────────

def test_list_returns_itinerary_places(client, auth_headers, itinerary, place_category_ids):
    _create(client, auth_headers, itinerary, place_category_ids)
    _create(client, auth_headers, itinerary, place_category_ids, label="Slipway",
            categoryId=place_category_ids["slipway"])
    resp = client.get(f"{PLACE_BASE}/by-itinerary/{itinerary['id']}", headers=auth_headers)
    assert resp.status_code == 200
    assert len(resp.get_json()) == 2


def test_list_unowned_returns_403(client, auth_headers_2, itinerary):
    resp = client.get(f"{PLACE_BASE}/by-itinerary/{itinerary['id']}", headers=auth_headers_2)
    assert resp.status_code == 403


def test_get_returns_place(client, auth_headers, itinerary, place_category_ids):
    place_id = _create(client, auth_headers, itinerary, place_category_ids).get_json()["id"]
    resp = client.get(f"{PLACE_BASE}/{place_id}", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.get_json()["id"] == place_id


def test_range_returns_nearby_with_distance(client, auth_headers, itinerary, place_category_ids):
    _create(client, auth_headers, itinerary, place_category_ids)
    resp = client.get(
        f"{PLACE_BASE}/by-itinerary/{itinerary['id']}/range?lat=50.3&lng=-4.1&range=5",
        headers=auth_headers,
    )
    assert resp.status_code == 200
    rows = resp.get_json()
    assert len(rows) == 1
    assert rows[0]["distanceKm"] == 0.0


# ── patch / delete ───────────────────────────────────────────────────────────

def test_patch_by_creator_updates_label(client, auth_headers, itinerary, place_category_ids):
    place_id = _create(client, auth_headers, itinerary, place_category_ids).get_json()["id"]
    resp = client.patch(f"{PLACE_BASE}/{place_id}", json={"label": "Fresh tap"}, headers=auth_headers)
    assert resp.status_code == 200
    assert resp.get_json()["label"] == "Fresh tap"


def test_patch_missing_returns_404(client, auth_headers, itinerary, place_category_ids):
    # Create one so the requester is a member, then patch a non-existent id.
    _create(client, auth_headers, itinerary, place_category_ids)
    resp = client.patch(f"{PLACE_BASE}/{uuid4()}", json={"label": "x"}, headers=auth_headers)
    assert resp.status_code in (403, 404)


def test_delete_by_creator(client, auth_headers, itinerary, place_category_ids):
    place_id = _create(client, auth_headers, itinerary, place_category_ids).get_json()["id"]
    assert client.delete(f"{PLACE_BASE}/{place_id}", headers=auth_headers).status_code == 200
    assert client.get(f"{PLACE_BASE}/{place_id}", headers=auth_headers).status_code == 404


# ── creator-only: a crew member may read but not edit/delete ─────────────────

def test_crew_member_cannot_edit_or_delete_creators_place(
    client, place_category_ids, trip_with_user2_as_crew
):
    leader = trip_with_user2_as_crew["leader_headers"]
    crew = trip_with_user2_as_crew["crew_headers"]
    itinerary = {"id": trip_with_user2_as_crew["trip"]["itinerary"]["id"]}

    place_id = _create(client, leader, itinerary, place_category_ids).get_json()["id"]

    # Crew is a trip member → may read.
    assert client.get(f"{PLACE_BASE}/{place_id}", headers=crew).status_code == 200
    # …but not edit or delete someone else's place.
    assert client.patch(f"{PLACE_BASE}/{place_id}", json={"label": "x"}, headers=crew).status_code == 403
    assert client.delete(f"{PLACE_BASE}/{place_id}", headers=crew).status_code == 403
    # Creator still can.
    assert client.delete(f"{PLACE_BASE}/{place_id}", headers=leader).status_code == 200
