"""
Integration tests for GET /api/item-categories.

The endpoint is public (no auth required) and returns the seeded list.
"""
import json
from Resources.item_category_resource import ITEM_CATEGORY_ENDPOINT

EXPECTED_SLUGS = {"first_aid", "camping", "repair", "travel", "generic", "food"}
EXPECTED_NAMES = {"First Aid", "Camping", "Repair", "Travel", "Generic", "Food"}


def test_get_item_categories_no_auth(client):
    """Endpoint is public — no Authorization header needed."""
    response = client.get(ITEM_CATEGORY_ENDPOINT)
    assert response.status_code == 200


def test_get_item_categories_returns_all_seeded(client):
    """All six default categories are present in the response."""
    response = client.get(ITEM_CATEGORY_ENDPOINT)
    data = json.loads(response.data)

    assert isinstance(data, list)
    assert len(data) >= len(EXPECTED_SLUGS)

    slugs = {item["slug"] for item in data}
    names = {item["name"] for item in data}

    assert EXPECTED_SLUGS.issubset(slugs)
    assert EXPECTED_NAMES.issubset(names)


def test_get_item_categories_shape(client):
    """Each category has id, slug, and name fields."""
    response = client.get(ITEM_CATEGORY_ENDPOINT)
    data = json.loads(response.data)

    for category in data:
        assert "id" in category
        assert "slug" in category
        assert "name" in category


def test_get_item_categories_ordered_by_name(client):
    """Categories are returned in alphabetical order by name."""
    response = client.get(ITEM_CATEGORY_ENDPOINT)
    data = json.loads(response.data)

    names = [item["name"] for item in data]
    assert names == sorted(names)
