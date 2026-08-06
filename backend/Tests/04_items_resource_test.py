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

    # Verify the item is actually deleted (rubric: assert behavior, not status codes)
    get_response = client.get(f"{ITEM_ENDPOINT}/{item_id}", headers=auth_headers)
    assert get_response.status_code == 404


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


def test_create_item_defaults_default_pack_to_none(client, auth_headers, category_ids):
    """A freshly custom-created item is unaffected by M10 — defaultPack is None."""
    response = client.post(
        f"{ITEM_ENDPOINT}/create",
        json={"name": "custom paddle leash", "categoryId": category_ids["generic"]},
        headers=auth_headers,
    )
    assert response.status_code == 201
    data = json.loads(response.data)
    assert data['defaultPack'] is None

    client.delete(f"{ITEM_ENDPOINT}/{data['id']}", headers=auth_headers)


def test_toggle_default_pack(client, auth_headers, inventory_with_items):
    """PATCH defaultPack persists and can be toggled back off."""
    item_id = inventory_with_items['items'][0]['id']

    response = client.patch(
        f"{ITEM_ENDPOINT}/{item_id}",
        json={"defaultPack": True},
        headers=auth_headers,
    )
    assert response.status_code == 200
    assert json.loads(response.data)['defaultPack'] is True

    response = client.get(f"{ITEM_ENDPOINT}/{item_id}", headers=auth_headers)
    assert json.loads(response.data)['defaultPack'] is True

    response = client.patch(
        f"{ITEM_ENDPOINT}/{item_id}",
        json={"defaultPack": False},
        headers=auth_headers,
    )
    assert response.status_code == 200
    assert json.loads(response.data)['defaultPack'] is False


def test_delete_item_cascades_to_packing_entries(client, auth_headers, trip_with_crew):
    """Deleting an item cascades to PersonalPackingItem entries (ondelete='CASCADE')."""
    from Resources.personal_packing_resource import PACKING_ENDPOINT

    trip_id = trip_with_crew['trip']['id']

    # Create an owned item
    item_response = client.post(
        f"{ITEM_ENDPOINT}/create",
        headers=auth_headers,
        json={"name": "test item for cascade", "status": "owned"},
    )
    assert item_response.status_code == 201
    item_id = json.loads(item_response.data)['id']

    # Add it to the packing list
    packing_response = client.post(
        f"{PACKING_ENDPOINT}/create",
        headers=auth_headers,
        json={"tripId": trip_id, "itemId": item_id},
    )
    assert packing_response.status_code == 201
    packing_id = json.loads(packing_response.data)['id']

    # Verify it's there
    packing_list = json.loads(
        client.get(f"{PACKING_ENDPOINT}/trip/{trip_id}", headers=auth_headers).data
    )
    assert packing_id in {e['id'] for e in packing_list}

    # Delete the item
    delete_response = client.delete(f"{ITEM_ENDPOINT}/{item_id}", headers=auth_headers)
    assert delete_response.status_code == 200

    # Item is gone (verified above)
    # Packing entry should be cascade-deleted
    packing_list_after = json.loads(
        client.get(f"{PACKING_ENDPOINT}/trip/{trip_id}", headers=auth_headers).data
    )
    assert packing_id not in {e['id'] for e in packing_list_after}


def test_delete_item_cascades_requirement_contributions(client, auth_headers, trip_with_crew):
    """Deleting an item cascades to RequirementContribution rows (ondelete='CASCADE')."""
    from Resources.inventory_resource import INVENTORY_ENDPOINT as INV_ENDPOINT

    inventory_id = trip_with_crew['trip']['inventory']['id']

    # Add a requirement
    req_response = client.post(
        f"{INV_ENDPOINT}/{inventory_id}/requirements",
        headers=auth_headers,
        json={"name": "Test Requirement", "category": "travel"},
    )
    assert req_response.status_code == 201
    req_id = json.loads(req_response.data)['id']

    # Create an owned item
    item_response = client.post(
        f"{ITEM_ENDPOINT}/create",
        headers=auth_headers,
        json={"name": "test item for req", "status": "owned"},
    )
    assert item_response.status_code == 201
    item_id = json.loads(item_response.data)['id']

    # Contribute the item to the requirement
    contrib_response = client.post(
        f"{INV_ENDPOINT}/{inventory_id}/requirements/{req_id}/contribute",
        headers=auth_headers,
        json={"itemId": item_id},
    )
    assert contrib_response.status_code == 200
    assert json.loads(contrib_response.data)['status'] == "covered"

    # Delete the item
    delete_response = client.delete(f"{ITEM_ENDPOINT}/{item_id}", headers=auth_headers)
    assert delete_response.status_code == 200

    # Requirement should revert to "needed" (contributions cascade-deleted)
    req_after = json.loads(
        client.get(f"{INV_ENDPOINT}/{inventory_id}", headers=auth_headers).data
    )
    requirement = next(r for r in req_after['requirements'] if r['id'] == req_id)
    assert requirement['status'] == "needed"
    assert requirement['contributions'] == []
