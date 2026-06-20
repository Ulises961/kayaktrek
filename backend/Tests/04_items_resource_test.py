from Resources.item_resource import ITEM_ENDPOINT
import json


def test_update_item(client, auth_headers, inventory_with_items, category_ids):
    item_id = inventory_with_items['items'][0]['id']
    payload = {
        "id": item_id,
        "categoryId": category_ids["generic"],
        "checked": False,
        "name": "generic_item",
    }
    response = client.patch(f"{ITEM_ENDPOINT}/{item_id}", json=payload, headers=auth_headers)
    assert response.status_code == 200

    response = client.get(f"{ITEM_ENDPOINT}/{item_id}", headers=auth_headers)
    assert response.status_code == 200
    updated_item = json.loads(response.data)
    assert updated_item['category']['slug'] == "generic"
    assert updated_item['checked'] == False
    assert updated_item['name'] == "generic_item"


def test_get_item_by_id(client, auth_headers, inventory_with_items):
    item_id = inventory_with_items['items'][0]['id']
    response = client.get(f"{ITEM_ENDPOINT}/{item_id}", headers=auth_headers)

    assert response.status_code == 200
    data = json.loads(response.data)
    assert data['name'] == "compass"
    assert data['category']['slug'] == "travel"
    assert data['id'] == item_id


def test_delete_item(client, auth_headers, inventory_with_items):
    item_id = inventory_with_items['items'][0]['id']
    response = client.delete(f"{ITEM_ENDPOINT}/{item_id}", headers=auth_headers)
    assert response.status_code == 200


def test_get_all_items(client, auth_headers, inventory_with_items):
    """GET /api/item/all returns the current user's personal items."""
    response = client.get(f"{ITEM_ENDPOINT}/all", headers=auth_headers)
    assert response.status_code == 200

    data = json.loads(response.data)
    assert isinstance(data, list)
    returned_ids = {item['id'] for item in data}
    for created in inventory_with_items['items']:
        assert created['id'] in returned_ids


def test_get_all_items_scoped_to_user(client, outsider_headers, inventory_with_items):
    """Another user never sees items they do not own."""
    response = client.get(f"{ITEM_ENDPOINT}/all", headers=outsider_headers)
    assert response.status_code == 200

    returned_ids = {item['id'] for item in json.loads(response.data)}
    for created in inventory_with_items['items']:
        assert created['id'] not in returned_ids


def test_create_item_without_inventory(client, auth_headers, category_ids):
    """A personal item can be created with no inventory — it is user-owned gear."""
    response = client.post(
        f"{ITEM_ENDPOINT}/create",
        json={"name": "drysuit", "categoryId": category_ids["generic"], "status": "owned"},
        headers=auth_headers,
    )
    assert response.status_code == 201

    data = json.loads(response.data)
    assert data['name'] == "drysuit"
    assert data['status'] == "owned"

    client.delete(f"{ITEM_ENDPOINT}/{data['id']}", headers=auth_headers)


def test_promote_item_to_owned(client, auth_headers, inventory_with_items):
    """PATCH status promotes a suggested item to owned."""
    item_id = inventory_with_items['items'][0]['id']

    response = client.patch(
        f"{ITEM_ENDPOINT}/{item_id}",
        json={"status": "owned"},
        headers=auth_headers,
    )
    assert response.status_code == 200
    assert json.loads(response.data)['status'] == "owned"
