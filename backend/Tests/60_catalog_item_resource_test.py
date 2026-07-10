from Resources.catalog_item_resource import CATALOG_ITEM_ENDPOINT
import json


def test_create_catalog_item(client, auth_headers, category_ids):
    response = client.post(
        f"{CATALOG_ITEM_ENDPOINT}/create",
        json={"name": "Spare paddle (split)", "categoryId": category_ids["gear"]},
        headers=auth_headers,
    )
    assert response.status_code == 201

    data = json.loads(response.data)
    assert data['name'] == "Spare paddle (split)"
    assert data['category']['slug'] == "gear"

    client.delete(f"{CATALOG_ITEM_ENDPOINT}/{data['id']}", headers=auth_headers)


def test_get_all_catalog_items_scoped_to_owner(client, auth_headers, outsider_headers, category_ids):
    created = client.post(
        f"{CATALOG_ITEM_ENDPOINT}/create",
        json={"name": "Group tow line", "categoryId": category_ids["gear"]},
        headers=auth_headers,
    )
    item_id = json.loads(created.data)['id']

    response = client.get(f"{CATALOG_ITEM_ENDPOINT}/all", headers=auth_headers)
    assert response.status_code == 200
    returned_ids = {item['id'] for item in json.loads(response.data)}
    assert item_id in returned_ids

    outsider_response = client.get(f"{CATALOG_ITEM_ENDPOINT}/all", headers=outsider_headers)
    outsider_ids = {item['id'] for item in json.loads(outsider_response.data)}
    assert item_id not in outsider_ids

    client.delete(f"{CATALOG_ITEM_ENDPOINT}/{item_id}", headers=auth_headers)


def test_update_catalog_item(client, auth_headers, category_ids):
    created = client.post(
        f"{CATALOG_ITEM_ENDPOINT}/create",
        json={"name": "Chart case", "categoryId": category_ids["gear"]},
        headers=auth_headers,
    )
    item_id = json.loads(created.data)['id']

    response = client.patch(
        f"{CATALOG_ITEM_ENDPOINT}/{item_id}",
        json={"name": "Chart + waterproof case", "categoryId": category_ids["travel"]},
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = json.loads(response.data)
    assert data['name'] == "Chart + waterproof case"
    assert data['category']['slug'] == "travel"

    client.delete(f"{CATALOG_ITEM_ENDPOINT}/{item_id}", headers=auth_headers)


def test_update_catalog_item_owned_by_another_user_forbidden(client, auth_headers, outsider_headers, category_ids):
    created = client.post(
        f"{CATALOG_ITEM_ENDPOINT}/create",
        json={"name": "VHF radio", "categoryId": category_ids["gear"]},
        headers=auth_headers,
    )
    item_id = json.loads(created.data)['id']

    response = client.patch(
        f"{CATALOG_ITEM_ENDPOINT}/{item_id}",
        json={"name": "hijacked"},
        headers=outsider_headers,
    )
    assert response.status_code == 403

    client.delete(f"{CATALOG_ITEM_ENDPOINT}/{item_id}", headers=auth_headers)


def test_delete_catalog_item_owned_by_another_user_forbidden(client, auth_headers, outsider_headers, category_ids):
    created = client.post(
        f"{CATALOG_ITEM_ENDPOINT}/create",
        json={"name": "PLB / EPIRB", "categoryId": category_ids["gear"]},
        headers=auth_headers,
    )
    item_id = json.loads(created.data)['id']

    response = client.delete(f"{CATALOG_ITEM_ENDPOINT}/{item_id}", headers=outsider_headers)
    assert response.status_code == 403

    client.delete(f"{CATALOG_ITEM_ENDPOINT}/{item_id}", headers=auth_headers)


def test_delete_catalog_item(client, auth_headers, category_ids):
    created = client.post(
        f"{CATALOG_ITEM_ENDPOINT}/create",
        json={"name": "Repair kit", "categoryId": category_ids["repair"]},
        headers=auth_headers,
    )
    item_id = json.loads(created.data)['id']

    response = client.delete(f"{CATALOG_ITEM_ENDPOINT}/{item_id}", headers=auth_headers)
    assert response.status_code == 200


def test_reset_to_default(client, outsider_headers):
    """A first-timer's empty template bootstraps from DEFAULT_TRIP_REQUIREMENTS."""
    response = client.post(f"{CATALOG_ITEM_ENDPOINT}/reset-to-default", headers=outsider_headers)
    assert response.status_code == 201

    data = json.loads(response.data)
    assert len(data) > 0
    names = {item['name'] for item in data}
    assert "Spare paddle (split)" in names


def test_reset_to_default_rejects_when_nonempty(client, outsider_headers, category_ids):
    first = client.post(f"{CATALOG_ITEM_ENDPOINT}/reset-to-default", headers=outsider_headers)
    assert first.status_code == 201

    second = client.post(f"{CATALOG_ITEM_ENDPOINT}/reset-to-default", headers=outsider_headers)
    assert second.status_code == 400
