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
