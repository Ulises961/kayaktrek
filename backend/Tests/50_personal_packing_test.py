"""
Integration tests for the private personal packing list (M6b §7):
  GET    /api/packing/trip/<trip_id>
  POST   /api/packing/create
  PATCH  /api/packing/<id>
  DELETE /api/packing/<id>

The list is private: only the owning member reads or mutates it (the leader has no
special access). Non-owner reads/mutations return 404, never 403 — the API never
confirms another member's entry even exists.
"""

from uuid import uuid4
import json

from Resources.personal_packing_resource import PACKING_ENDPOINT
from Resources.item_resource import ITEM_ENDPOINT


def _create_owned_item(client, headers, name="drysuit"):
    """Create an owned personal item (eligible for the packing list)."""
    return client.post(
        f"{ITEM_ENDPOINT}/create",
        headers=headers,
        json={"name": name, "status": "owned"},
    )


def _add_packing(client, headers, trip_id, item_id):
    return client.post(
        f"{PACKING_ENDPOINT}/create",
        headers=headers,
        json={"tripId": trip_id, "itemId": item_id},
    )


# ---------------------------------------------------------------------------
# Seeding (M6b §7) — the leader's list is pre-populated at trip creation
# ---------------------------------------------------------------------------

def test_trip_create_seeds_leader_packing(client, auth_headers, trip_with_crew):
    """Creating a trip seeds the leader's private packing list from the default kit."""
    trip_id = trip_with_crew['trip']['id']

    resp = client.get(f"{PACKING_ENDPOINT}/trip/{trip_id}", headers=auth_headers)
    assert resp.status_code == 200
    data = json.loads(resp.data)
    assert len(data) >= 10, "expected a seeded default personal kit"
    assert "PFD (buoyancy aid)" in {e['item']['name'] for e in data}


def test_invitation_accept_seeds_crew_packing(client, trip_with_user2_as_crew):
    """Accepting an invitation seeds the new member's private packing list."""
    trip_id = trip_with_user2_as_crew['trip']['id']
    crew_headers = trip_with_user2_as_crew['crew_headers']

    resp = client.get(f"{PACKING_ENDPOINT}/trip/{trip_id}", headers=crew_headers)
    assert resp.status_code == 200
    data = json.loads(resp.data)
    assert len(data) >= 10, "crew member should receive a seeded default kit on join"
    assert "PFD (buoyancy aid)" in {e['item']['name'] for e in data}


# ---------------------------------------------------------------------------
# Add / toggle / remove (own entries)
# ---------------------------------------------------------------------------

def test_add_owned_item_to_packing(client, trip_with_crew):
    """A member can add one of their own owned items to their packing list."""
    trip_id = trip_with_crew['trip']['id']
    crew_headers = trip_with_crew['crew_headers']

    item_id = json.loads(_create_owned_item(client, crew_headers, "crew stove").data)['id']
    resp = _add_packing(client, crew_headers, trip_id, item_id)
    assert resp.status_code == 201
    assert json.loads(resp.data)['item']['id'] == item_id

    listed = json.loads(client.get(f"{PACKING_ENDPOINT}/trip/{trip_id}", headers=crew_headers).data)
    assert item_id in {e['item']['id'] for e in listed}


def test_add_suggested_item_rejected(client, trip_with_crew):
    """Only owned items can be packed — a suggested item is rejected (400)."""
    trip_id = trip_with_crew['trip']['id']
    crew_headers = trip_with_crew['crew_headers']

    item_id = json.loads(
        client.post(
            f"{ITEM_ENDPOINT}/create",
            headers=crew_headers,
            json={"name": "maybe tent", "status": "suggested"},
        ).data
    )['id']

    resp = _add_packing(client, crew_headers, trip_id, item_id)
    assert resp.status_code == 400


def test_add_other_users_item_403(client, auth_headers, trip_with_crew):
    """A member cannot pack gear they do not own (403)."""
    trip_id = trip_with_crew['trip']['id']
    crew_headers = trip_with_crew['crew_headers']

    # A leader-owned (seeded) item.
    leader_items = json.loads(client.get(f"{ITEM_ENDPOINT}/all", headers=auth_headers).data)
    leader_item_id = leader_items[0]['id']

    resp = _add_packing(client, crew_headers, trip_id, leader_item_id)
    assert resp.status_code == 403


def test_add_duplicate_rejected(client, trip_with_crew):
    """An item appears at most once on a member's list (400 on a repeat)."""
    trip_id = trip_with_crew['trip']['id']
    crew_headers = trip_with_crew['crew_headers']

    item_id = json.loads(_create_owned_item(client, crew_headers, "crew compass").data)['id']
    assert _add_packing(client, crew_headers, trip_id, item_id).status_code == 201
    assert _add_packing(client, crew_headers, trip_id, item_id).status_code == 400


def test_add_non_member_404(client, outsider_headers, trip_with_crew):
    """A non-member cannot add to any packing list for the trip (404 — no leak)."""
    trip_id = trip_with_crew['trip']['id']
    resp = _add_packing(client, outsider_headers, trip_id, str(uuid4()))
    assert resp.status_code == 404


def test_toggle_checked(client, trip_with_crew):
    """A member can toggle the packed flag on their own entry."""
    trip_id = trip_with_crew['trip']['id']
    crew_headers = trip_with_crew['crew_headers']

    item_id = json.loads(_create_owned_item(client, crew_headers, "crew knife").data)['id']
    entry = json.loads(_add_packing(client, crew_headers, trip_id, item_id).data)
    assert entry['checked'] is False

    resp = client.patch(
        f"{PACKING_ENDPOINT}/{entry['id']}", headers=crew_headers, json={"checked": True}
    )
    assert resp.status_code == 200
    assert json.loads(resp.data)['checked'] is True


def test_remove_entry(client, trip_with_crew):
    """A member can remove their own entry."""
    trip_id = trip_with_crew['trip']['id']
    crew_headers = trip_with_crew['crew_headers']

    item_id = json.loads(_create_owned_item(client, crew_headers, "crew sponge").data)['id']
    entry_id = json.loads(_add_packing(client, crew_headers, trip_id, item_id).data)['id']

    assert client.delete(f"{PACKING_ENDPOINT}/{entry_id}", headers=crew_headers).status_code == 200
    listed = json.loads(client.get(f"{PACKING_ENDPOINT}/trip/{trip_id}", headers=crew_headers).data)
    assert entry_id not in {e['id'] for e in listed}


# ---------------------------------------------------------------------------
# Privacy — another member can never touch your entries
# ---------------------------------------------------------------------------

def test_other_member_cannot_touch_my_entry_404(client, auth_headers, trip_with_crew):
    """A crew member gets 404 (not 403) for the leader's packing entries — the list
    is private and its existence is never confirmed to others."""
    trip_id = trip_with_crew['trip']['id']
    crew_headers = trip_with_crew['crew_headers']

    leader_entries = json.loads(
        client.get(f"{PACKING_ENDPOINT}/trip/{trip_id}", headers=auth_headers).data
    )
    leader_entry_id = leader_entries[0]['id']

    assert client.patch(
        f"{PACKING_ENDPOINT}/{leader_entry_id}", headers=crew_headers, json={"checked": True}
    ).status_code == 404
    assert client.delete(
        f"{PACKING_ENDPOINT}/{leader_entry_id}", headers=crew_headers
    ).status_code == 404


def test_list_scoped_to_caller(client, auth_headers, trip_with_crew):
    """Each member sees only their own list — the crew's entries never leak into the
    leader's and vice versa."""
    trip_id = trip_with_crew['trip']['id']
    crew_headers = trip_with_crew['crew_headers']

    item_id = json.loads(_create_owned_item(client, crew_headers, "crew-only bottle").data)['id']
    _add_packing(client, crew_headers, trip_id, item_id)

    leader_item_ids = {
        e['item']['id']
        for e in json.loads(client.get(f"{PACKING_ENDPOINT}/trip/{trip_id}", headers=auth_headers).data)
    }
    assert item_id not in leader_item_ids


# ---------------------------------------------------------------------------
# Cascade behavior: deleting an item cascades to packing entries
# ---------------------------------------------------------------------------

def test_delete_item_cascades_packing_entries(client, trip_with_crew):
    """Deleting an item cascades to PersonalPackingItem entries referencing it."""
    from Resources.item_resource import ITEM_ENDPOINT

    trip_id = trip_with_crew['trip']['id']
    crew_headers = trip_with_crew['crew_headers']

    # Create and add an item to the packing list
    item_id = json.loads(_create_owned_item(client, crew_headers, "crew paddle").data)['id']
    entry = json.loads(_add_packing(client, crew_headers, trip_id, item_id).data)
    entry_id = entry['id']

    # Verify it's there
    packing_list = json.loads(
        client.get(f"{PACKING_ENDPOINT}/trip/{trip_id}", headers=crew_headers).data
    )
    assert entry_id in {e['id'] for e in packing_list}

    # Delete the item
    delete_response = client.delete(f"{ITEM_ENDPOINT}/{item_id}", headers=crew_headers)
    assert delete_response.status_code == 200

    # Packing entry should be cascade-deleted
    packing_list_after = json.loads(
        client.get(f"{PACKING_ENDPOINT}/trip/{trip_id}", headers=crew_headers).data
    )
    assert entry_id not in {e['id'] for e in packing_list_after}
