"""
Integration tests for TripRequirement endpoints:
  POST   /api/inventory/<id>/requirements
  DELETE /api/inventory/<id>/requirements/<req_id>
  POST   /api/inventory/<id>/requirements/<req_id>/contribute
  DELETE /api/inventory/<id>/requirements/<req_id>/contribute
"""

from Resources.inventory_resource import INVENTORY_ENDPOINT
from Resources.item_resource import ITEM_ENDPOINT
import json


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _add_requirement(client, headers, inventory_id, name="First Aid Kit", category="first_aid"):
    return client.post(
        f"{INVENTORY_ENDPOINT}/{inventory_id}/requirements",
        headers=headers,
        json={"name": name, "category": category},
    )


def _create_item(client, headers, inventory_id, name="paddle", category="travel"):
    """Create a personal item. inventoryId is only used for auth middleware."""
    return client.post(
        f"{ITEM_ENDPOINT}/create",
        headers=headers,
        json={"inventoryId": inventory_id, "name": name, "category": category},
    )


# ---------------------------------------------------------------------------
# Add requirement
# ---------------------------------------------------------------------------

def test_add_requirement(client, auth_headers, trip_with_crew):
    """Leader can add a requirement to the trip inventory."""
    inventory_id = trip_with_crew['trip']['inventory']['id']

    response = _add_requirement(client, auth_headers, inventory_id)
    assert response.status_code == 201

    data = json.loads(response.data)
    assert data['name'] == "First Aid Kit"
    assert data['status'] == "needed"
    assert data['checked'] == False
    assert data['contributors'] == []


def test_add_requirement_crew_member(client, trip_with_crew):
    """Crew members can also add requirements (no leader restriction on this endpoint)."""
    inventory_id = trip_with_crew['trip']['inventory']['id']
    crew_headers = trip_with_crew['crew_headers']

    response = _add_requirement(client, crew_headers, inventory_id, name="Tent")
    assert response.status_code == 201
    assert json.loads(response.data)['name'] == "Tent"


def test_add_requirement_outsider_403(client, outsider_headers, trip_with_crew):
    """Non-members cannot add requirements."""
    inventory_id = trip_with_crew['trip']['inventory']['id']

    response = _add_requirement(client, outsider_headers, inventory_id)
    assert response.status_code == 403


# ---------------------------------------------------------------------------
# Remove requirement
# ---------------------------------------------------------------------------

def test_remove_requirement(client, auth_headers, trip_with_crew):
    """A requirement can be removed by a trip member."""
    inventory_id = trip_with_crew['trip']['inventory']['id']

    req_id = json.loads(_add_requirement(client, auth_headers, inventory_id).data)['id']

    delete_response = client.delete(
        f"{INVENTORY_ENDPOINT}/{inventory_id}/requirements/{req_id}",
        headers=auth_headers,
    )
    assert delete_response.status_code == 200

    inv_response = client.get(f"{INVENTORY_ENDPOINT}/{inventory_id}", headers=auth_headers)
    requirements = json.loads(inv_response.data)['requirements']
    assert all(r['id'] != req_id for r in requirements)


def test_remove_requirement_outsider_403(client, outsider_headers, auth_headers, trip_with_crew):
    """Non-members cannot remove requirements."""
    inventory_id = trip_with_crew['trip']['inventory']['id']
    req_id = json.loads(_add_requirement(client, auth_headers, inventory_id).data)['id']

    response = client.delete(
        f"{INVENTORY_ENDPOINT}/{inventory_id}/requirements/{req_id}",
        headers=outsider_headers,
    )
    assert response.status_code == 403


# ---------------------------------------------------------------------------
# Contribute item
# ---------------------------------------------------------------------------

def test_contribute_item(client, auth_headers, trip_with_crew):
    """A trip member can contribute a personal item to a requirement."""
    inventory_id = trip_with_crew['trip']['inventory']['id']

    req_id = json.loads(_add_requirement(client, auth_headers, inventory_id).data)['id']
    item_id = json.loads(_create_item(client, auth_headers, inventory_id).data)['id']

    response = client.post(
        f"{INVENTORY_ENDPOINT}/{inventory_id}/requirements/{req_id}/contribute",
        headers=auth_headers,
        json={"itemId": item_id},
    )
    assert response.status_code == 200

    data = json.loads(response.data)
    assert data['status'] == "covered"
    assert data['coveringItemId'] == item_id
    assert len(data['contributors']) == 1
    contributor = data['contributors'][0]
    assert contributor.get('id') is not None
    assert contributor.get('username') is not None, "contributor must be a User, not a TripMember stub"

    # Cleanup item
    client.delete(f"{ITEM_ENDPOINT}/{item_id}", headers=auth_headers)


def test_contribute_item_outsider_403(client, outsider_headers, auth_headers, trip_with_crew):
    """Non-members cannot contribute items to the trip's requirements."""
    inventory_id = trip_with_crew['trip']['inventory']['id']
    req_id = json.loads(_add_requirement(client, auth_headers, inventory_id).data)['id']

    response = client.post(
        f"{INVENTORY_ENDPOINT}/{inventory_id}/requirements/{req_id}/contribute",
        headers=outsider_headers,
        json={"itemId": "00000000-0000-0000-0000-000000000001"},
    )
    assert response.status_code == 403


def test_contribute_requires_item_id(client, auth_headers, trip_with_crew):
    """Contributing without an itemId returns 400."""
    inventory_id = trip_with_crew['trip']['inventory']['id']
    req_id = json.loads(_add_requirement(client, auth_headers, inventory_id).data)['id']

    response = client.post(
        f"{INVENTORY_ENDPOINT}/{inventory_id}/requirements/{req_id}/contribute",
        headers=auth_headers,
        json={},
    )
    assert response.status_code == 400


# ---------------------------------------------------------------------------
# Unclaim requirement
# ---------------------------------------------------------------------------

def test_unclaim_requirement(client, auth_headers, trip_with_crew):
    """After unclaiming, the requirement reverts to 'needed' with no covering item."""
    inventory_id = trip_with_crew['trip']['inventory']['id']

    req_id = json.loads(_add_requirement(client, auth_headers, inventory_id).data)['id']
    item_id = json.loads(_create_item(client, auth_headers, inventory_id).data)['id']

    # Contribute first
    client.post(
        f"{INVENTORY_ENDPOINT}/{inventory_id}/requirements/{req_id}/contribute",
        headers=auth_headers,
        json={"itemId": item_id},
    )

    # Unclaim
    response = client.delete(
        f"{INVENTORY_ENDPOINT}/{inventory_id}/requirements/{req_id}/contribute",
        headers=auth_headers,
    )
    assert response.status_code == 200

    data = json.loads(response.data)
    assert data['status'] == "needed"
    assert data['coveringItemId'] is None
    assert data['contributors'] == []

    # Cleanup item
    client.delete(f"{ITEM_ENDPOINT}/{item_id}", headers=auth_headers)


def test_unclaim_no_op_when_not_covered(client, auth_headers, trip_with_crew):
    """Unclaiming a requirement that is not covered returns 200 without side-effects."""
    inventory_id = trip_with_crew['trip']['inventory']['id']
    req_id = json.loads(_add_requirement(client, auth_headers, inventory_id).data)['id']

    response = client.delete(
        f"{INVENTORY_ENDPOINT}/{inventory_id}/requirements/{req_id}/contribute",
        headers=auth_headers,
    )
    assert response.status_code == 200

    data = json.loads(response.data)
    assert data['status'] == "needed"
    assert data['coveringItemId'] is None
