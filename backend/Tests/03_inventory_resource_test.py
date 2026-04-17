from Resources.inventory_resource import INVENTORY_ENDPOINT
import json


def test_create_inventory(client, auth_headers, id):
    """Test creating an empty inventory."""
    response = client.post(f"{INVENTORY_ENDPOINT}/create", headers=auth_headers, json={})
    assert response.status_code == 201

    data = json.loads(response.data)
    assert data['userId'] == id
    assert data['requirements'] == []
    assert data.get('tripId') is None

    client.delete(f"{INVENTORY_ENDPOINT}/{data['id']}", headers=auth_headers)


def test_get_inventory_by_id(client, auth_headers, empty_inventory):
    """Test retrieving an inventory by ID."""
    inventory_id = empty_inventory['id']

    response = client.get(f"{INVENTORY_ENDPOINT}/{inventory_id}", headers=auth_headers)
    assert response.status_code == 200

    data = json.loads(response.data)
    assert data['id'] == inventory_id
    assert data['requirements'] == []


def test_get_all_inventories(client, auth_headers, empty_inventory):
    """Test retrieving all inventories for the current user."""
    response = client.get(f"{INVENTORY_ENDPOINT}/all", headers=auth_headers)
    assert response.status_code == 200

    data = json.loads(response.data)
    assert isinstance(data, list)
    assert any(inv['id'] == empty_inventory['id'] for inv in data)


def test_update_inventory(client, auth_headers, empty_inventory):
    """Test updating an inventory (no-op: re-submit same id)."""
    inventory_id = empty_inventory['id']

    response = client.patch(
        f"{INVENTORY_ENDPOINT}/{inventory_id}",
        headers=auth_headers,
        json={"id": inventory_id},
    )
    assert response.status_code == 200

    data = json.loads(response.data)
    assert data['id'] == inventory_id
    assert data['requirements'] == []


def test_delete_inventory(client, auth_headers):
    """Test deleting an inventory."""
    create_response = client.post(
        f"{INVENTORY_ENDPOINT}/create", headers=auth_headers, json={}
    )
    assert create_response.status_code == 201
    inventory_id = json.loads(create_response.data)['id']

    response = client.delete(f"{INVENTORY_ENDPOINT}/{inventory_id}", headers=auth_headers)
    assert response.status_code == 200

    get_response = client.get(f"{INVENTORY_ENDPOINT}/{inventory_id}", headers=auth_headers)
    assert get_response.status_code == 404


def test_get_nonexistent_inventory(client, auth_headers):
    """Test that an invalid UUID returns 403 (ownership check short-circuits)."""
    response = client.get(f"{INVENTORY_ENDPOINT}/99999", headers=auth_headers)
    assert response.status_code == 403


def test_inventory_requires_auth(client):
    """Test that inventory endpoints reject unauthenticated requests."""
    response = client.get(f"{INVENTORY_ENDPOINT}/some-id")
    assert response.status_code == 403
