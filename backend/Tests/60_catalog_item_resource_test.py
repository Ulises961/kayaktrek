from Resources.catalog_item_resource import CATALOG_ITEM_ENDPOINT
from Resources.trip_resource import TRIP_ENDPOINT
from Resources.inventory_resource import INVENTORY_ENDPOINT
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


def test_create_catalog_item_rejects_empty_name(client, auth_headers):
    response = client.post(
        f"{CATALOG_ITEM_ENDPOINT}/create",
        json={"name": "   "},
        headers=auth_headers,
    )
    assert response.status_code == 400


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


def test_update_nonexistent_catalog_item_404(client, auth_headers):
    response = client.patch(
        f"{CATALOG_ITEM_ENDPOINT}/00000000-0000-7000-8000-000000000000",
        json={"name": "ghost"},
        headers=auth_headers,
    )
    assert response.status_code == 404


def test_delete_nonexistent_catalog_item_404(client, auth_headers):
    response = client.delete(
        f"{CATALOG_ITEM_ENDPOINT}/00000000-0000-7000-8000-000000000000",
        headers=auth_headers,
    )
    assert response.status_code == 404


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


# ---------------------------------------------------------------------------
# trip_service.create_trip seeding swap (M10 §3)
# ---------------------------------------------------------------------------

def test_create_trip_seeds_requirements_from_leaders_catalog(client, outsider_headers, category_ids):
    """A leader with a non-empty CatalogItem template seeds trip requirements
    from it — not the hardcoded defaults — and stamps provenance."""
    created = client.post(
        f"{CATALOG_ITEM_ENDPOINT}/create",
        json={"name": "Custom drogue", "categoryId": category_ids["gear"]},
        headers=outsider_headers,
    )
    catalog_item = json.loads(created.data)

    trip_response = client.post(
        f"{TRIP_ENDPOINT}/create",
        json={"inventory": {}, "itinerary": {"isPublic": True, "totalMiles": 0, "days": []}},
        headers=outsider_headers,
    )
    assert trip_response.status_code == 201
    trip_data = json.loads(trip_response.data)
    inventory_id = trip_data["inventory"]["id"]

    inv = json.loads(client.get(f"{INVENTORY_ENDPOINT}/{inventory_id}", headers=outsider_headers).data)
    requirements = inv["requirements"]

    assert len(requirements) == 1, "seeded only from the curated template, not the hardcoded defaults"
    assert requirements[0]["name"] == "Custom drogue"
    assert requirements[0]["category"] == "gear"
    assert requirements[0]["catalogItemId"] == catalog_item["id"]

    client.delete(f"{TRIP_ENDPOINT}/{trip_data['id']}", headers=outsider_headers)
    client.delete(f"{CATALOG_ITEM_ENDPOINT}/{catalog_item['id']}", headers=outsider_headers)


def test_create_trip_falls_back_to_defaults_without_catalog(client, outsider_headers):
    """A leader with no CatalogItem rows still gets the hardcoded default set,
    unchanged from pre-M10 behaviour."""
    trip_response = client.post(
        f"{TRIP_ENDPOINT}/create",
        json={"inventory": {}, "itinerary": {"isPublic": True, "totalMiles": 0, "days": []}},
        headers=outsider_headers,
    )
    assert trip_response.status_code == 201
    trip_data = json.loads(trip_response.data)
    inventory_id = trip_data["inventory"]["id"]

    inv = json.loads(client.get(f"{INVENTORY_ENDPOINT}/{inventory_id}", headers=outsider_headers).data)
    requirements = inv["requirements"]

    assert len(requirements) >= 10, "expected the hardcoded default requirement set"
    assert "Repair kit" in {r["name"] for r in requirements}
    assert all(r["catalogItemId"] is None for r in requirements)

    client.delete(f"{TRIP_ENDPOINT}/{trip_data['id']}", headers=outsider_headers)


# ---------------------------------------------------------------------------
# CatalogItem deletion and orphaned references
# ---------------------------------------------------------------------------

def test_delete_catalog_item_referenced_by_requirements(client, auth_headers, category_ids):
    """When a CatalogItem is deleted, TripRequirements that reference it via
    catalogItemId retain the stale reference (orphaned reference, not cascade-deleted).
    This is acceptable: the reference is informational only (provenance tracking),
    not a foreign key constraint. Seeded requirements survive catalog deletion."""
    created = client.post(
        f"{CATALOG_ITEM_ENDPOINT}/create",
        json={"name": "Catalog drogue", "categoryId": category_ids["gear"]},
        headers=auth_headers,
    )
    assert created.status_code == 201
    catalog_item = json.loads(created.data)
    catalog_id = catalog_item["id"]

    # Create a trip with this catalog
    trip_response = client.post(
        f"{TRIP_ENDPOINT}/create",
        json={"inventory": {}, "itinerary": {"isPublic": True, "totalMiles": 0, "days": []}},
        headers=auth_headers,
    )
    assert trip_response.status_code == 201
    trip_data = json.loads(trip_response.data)
    inventory_id = trip_data["inventory"]["id"]

    # Get requirements — should have one seeded from the catalog
    inv = json.loads(client.get(f"{INVENTORY_ENDPOINT}/{inventory_id}", headers=auth_headers).data)
    requirements = inv["requirements"]
    assert len(requirements) == 1, "should be seeded from the single catalog item"
    assert requirements[0]["catalogItemId"] == catalog_id

    # Delete the catalog item
    delete_response = client.delete(f"{CATALOG_ITEM_ENDPOINT}/{catalog_id}", headers=auth_headers)
    assert delete_response.status_code == 200

    # Requirement should still exist (not cascade-deleted)
    inv_after = json.loads(
        client.get(f"{INVENTORY_ENDPOINT}/{inventory_id}", headers=auth_headers).data
    )
    requirements_after = inv_after["requirements"]
    assert len(requirements_after) == 1
    assert requirements_after[0]["id"] == requirements[0]["id"]
    # The catalogItemId reference is now orphaned but still stored
    assert requirements_after[0]["catalogItemId"] == catalog_id

    # Cleanup
    client.delete(f"{TRIP_ENDPOINT}/{trip_data['id']}", headers=auth_headers)
