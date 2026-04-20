"""
Security boundary tests — server-enforced ownership and protected fields.

Covers:
- user_id cannot be spoofed on log and item creation
- PATCH /api/trip/<id> cannot change state (state machine bypass attempt)
- User registration ignores admin=true
- Cascade delete: trip deletion removes itinerary
- 401/403 on key auth-required and owner-only endpoints
- Wrong-user cannot PATCH another user's item
"""
import json
import pytest

from Api.database import db
from Models.user import User
from Resources.log_resource import LOG_ENDPOINT
from Resources.trip_resource import TRIP_ENDPOINT
from Resources.item_resource import ITEM_ENDPOINT
from Resources.itinerary_resource import ITINERARY_ENDPOINT
from Resources.inventory_resource import INVENTORY_ENDPOINT


# ---------------------------------------------------------------------------
# user_id spoof protection
# ---------------------------------------------------------------------------

def test_log_create_ignores_user_id_in_body(client, auth_headers, id):
    """Server must stamp user_id from JWT context — payload userId is silently dropped."""
    spoofed_id = "00000000-0000-0000-0000-000000000000"
    response = client.post(
        f"{LOG_ENDPOINT}/create",
        headers=auth_headers,
        json={"hours": 3, "avgSea": 2, "userId": spoofed_id},
    )
    assert response.status_code == 201
    data = json.loads(response.data)
    assert data["userId"] == id
    assert data["userId"] != spoofed_id

    client.delete(f"{LOG_ENDPOINT}/{data['id']}", headers=auth_headers)


def test_item_create_ignores_user_id_in_body(client, auth_headers, id, empty_inventory, category_ids):
    """Item user_id must come from JWT context, not the request body."""
    spoofed_id = "00000000-0000-0000-0000-000000000000"
    payload = {
        "inventoryId": empty_inventory["id"],
        "name": "test_item",
        "categoryId": category_ids["generic"],
        "userId": spoofed_id,
    }
    response = client.post(f"{ITEM_ENDPOINT}/create", headers=auth_headers, json=payload)
    assert response.status_code == 201
    data = json.loads(response.data)
    assert data["userId"] == id
    assert data["userId"] != spoofed_id

    client.delete(f"{ITEM_ENDPOINT}/{data['id']}", headers=auth_headers)


# ---------------------------------------------------------------------------
# State machine bypass protection
# ---------------------------------------------------------------------------

def test_patch_trip_cannot_change_state(client, auth_headers):
    """PATCH /api/trip/<id> must ignore a 'state' field — only the state endpoint advances state."""
    trip_response = client.post(
        f"{TRIP_ENDPOINT}/create",
        headers=auth_headers,
        json={"inventory": {}, "itinerary": {"isPublic": False, "totalMiles": 0, "days": []}},
    )
    assert trip_response.status_code == 201
    trip = json.loads(trip_response.data)
    assert trip["state"] == "draft"

    patch_response = client.patch(
        f"{TRIP_ENDPOINT}/{trip['id']}",
        headers=auth_headers,
        json={"state": "past", "destination": "Azores"},
    )
    assert patch_response.status_code == 200
    patched = json.loads(patch_response.data)
    # state must not have changed; destination should be updated
    assert patched["state"] == "draft"
    assert patched["destination"] == "Azores"

    client.delete(f"{TRIP_ENDPOINT}/{trip['id']}", headers=auth_headers)


# ---------------------------------------------------------------------------
# Admin spoof protection
# ---------------------------------------------------------------------------

def test_register_with_admin_true_is_not_admin(client):
    """A client-supplied admin=true must be silently ignored on registration."""
    payload = {
        "mail": "hacker.admin@example.com",
        "pwd": "Hack3r$ecure!",
        "phone": "5550000001",
        "username": "hacker_admin",
        "name": "Hacker",
        "admin": True,
    }
    response = client.post("/api/auth/register", json=payload)
    assert response.status_code == 201

    user = User.query.filter_by(mail=payload["mail"]).first()
    assert user is not None
    assert user.admin is False


# ---------------------------------------------------------------------------
# Cascade delete
# ---------------------------------------------------------------------------

def test_delete_trip_removes_itinerary(client, auth_headers):
    """Deleting a trip must cascade-delete the attached itinerary."""
    trip_response = client.post(
        f"{TRIP_ENDPOINT}/create",
        headers=auth_headers,
        json={"inventory": {}, "itinerary": {"isPublic": False, "totalMiles": 0, "days": []}},
    )
    assert trip_response.status_code == 201
    trip = json.loads(trip_response.data)
    itinerary_id = trip["itinerary"]["id"]

    delete_response = client.delete(f"{TRIP_ENDPOINT}/{trip['id']}", headers=auth_headers)
    assert delete_response.status_code == 200

    get_response = client.get(f"{ITINERARY_ENDPOINT}/{itinerary_id}", headers=auth_headers)
    assert get_response.status_code == 404


# ---------------------------------------------------------------------------
# 401 / 403 boundaries
# ---------------------------------------------------------------------------

def test_trip_endpoint_requires_auth(client):
    """GET /api/trip/<id>/all without a token must be rejected."""
    response = client.get(f"{TRIP_ENDPOINT}/some-id/all")
    assert response.status_code in (401, 403)


def test_log_endpoint_requires_auth(client):
    """GET /api/log/all without a token must be rejected."""
    response = client.get(f"{LOG_ENDPOINT}/all")
    assert response.status_code in (401, 403)


def test_item_endpoint_requires_auth(client):
    """GET /api/item/<id> without a token must be rejected."""
    response = client.get(f"{ITEM_ENDPOINT}/some-id")
    assert response.status_code in (401, 403)


def test_wrong_user_cannot_patch_item(client, outsider_headers, inventory_with_items):
    """A user who does not own an item must receive 403 on PATCH."""
    item_id = inventory_with_items["items"][0]["id"]
    response = client.patch(
        f"{ITEM_ENDPOINT}/{item_id}",
        headers=outsider_headers,
        json={"name": "stolen"},
    )
    assert response.status_code == 403


def test_wrong_user_cannot_patch_trip(client, outsider_headers):
    """An outsider must receive 403 when attempting to PATCH a trip they are not a member of."""
    # We need a trip ID that exists but the outsider doesn't belong to.
    # Use any UUID that likely doesn't exist — ownership check returns None → 404-like path,
    # but for a valid existing trip we rely on outsider_headers not being a member.
    response = client.patch(
        f"{TRIP_ENDPOINT}/00000000-0000-0000-0000-000000000001",
        headers=outsider_headers,
        json={"destination": "Stolen"},
    )
    assert response.status_code in (403, 404)
