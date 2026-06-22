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


def _create_item(client, headers, inventory_id, name="paddle", category="travel",
                 status="owned"):
    """Create a personal item. inventoryId is only used for auth middleware.

    Defaults to ``owned`` so the item is eligible to cover a requirement; pass
    ``status="suggested"`` to exercise the contribute guard.
    """
    return client.post(
        f"{ITEM_ENDPOINT}/create",
        headers=headers,
        json={"inventoryId": inventory_id, "name": name, "category": category,
              "status": status},
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
    assert data['contributions'] == []
    # Authorship is stamped from the caller (the leader, here).
    assert data['proposedBy']['user']['username'] is not None


def test_add_requirement_strips_html(client, auth_headers, trip_with_crew):
    """Free-text name and category have HTML stripped before storage."""
    inventory_id = trip_with_crew['trip']['inventory']['id']

    response = _add_requirement(
        client, auth_headers, inventory_id,
        name="<script>xss</script>First Aid Kit",
        category="<b>first_aid</b>",
    )
    assert response.status_code == 201
    data = json.loads(response.data)
    for field in ("name", "category"):
        assert "<" not in data[field] and ">" not in data[field], (
            f"HTML not stripped from {field}: {data[field]!r}"
        )


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
    assert len(data['contributions']) == 1
    contribution = data['contributions'][0]
    assert contribution['item']['id'] == item_id
    assert contribution['checked'] is False
    assert contribution['member']['user']['username'] is not None, \
        "contribution member must carry its User identity"

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


def test_contribute_suggested_item_rejected(client, auth_headers, trip_with_crew):
    """A suggested (unconfirmed) item cannot cover a requirement — must be owned first."""
    inventory_id = trip_with_crew['trip']['inventory']['id']
    req_id = json.loads(_add_requirement(client, auth_headers, inventory_id).data)['id']
    item_id = json.loads(
        _create_item(client, auth_headers, inventory_id, status="suggested").data
    )['id']

    response = client.post(
        f"{INVENTORY_ENDPOINT}/{inventory_id}/requirements/{req_id}/contribute",
        headers=auth_headers,
        json={"itemId": item_id},
    )
    assert response.status_code == 400

    # Requirement stays needed
    inv = json.loads(client.get(f"{INVENTORY_ENDPOINT}/{inventory_id}", headers=auth_headers).data)
    req = next(r for r in inv['requirements'] if r['id'] == req_id)
    assert req['status'] == "needed"

    client.delete(f"{ITEM_ENDPOINT}/{item_id}", headers=auth_headers)


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
    assert data['contributions'] == []

    # Cleanup item
    client.delete(f"{ITEM_ENDPOINT}/{item_id}", headers=auth_headers)


def test_unclaim_without_contribution_404(client, auth_headers, trip_with_crew):
    """Withdrawing when the caller has no contribution on the requirement returns 404."""
    inventory_id = trip_with_crew['trip']['inventory']['id']
    req_id = json.loads(_add_requirement(client, auth_headers, inventory_id).data)['id']

    response = client.delete(
        f"{INVENTORY_ENDPOINT}/{inventory_id}/requirements/{req_id}/contribute",
        headers=auth_headers,
    )
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# Authorship-scoped delete (M6b) — you may remove a requirement iff you proposed it
# ---------------------------------------------------------------------------

def test_remove_requirement_non_proposer_403(client, auth_headers, trip_with_crew):
    """A member who did NOT propose a requirement cannot delete it. Authorship, not
    mere membership, governs removal — and there is no leader override either way."""
    inventory_id = trip_with_crew['trip']['inventory']['id']
    crew_headers = trip_with_crew['crew_headers']

    # Leader proposes the requirement.
    req_id = json.loads(_add_requirement(client, auth_headers, inventory_id).data)['id']

    # Crew member (a trip member, but not the proposer) is refused.
    response = client.delete(
        f"{INVENTORY_ENDPOINT}/{inventory_id}/requirements/{req_id}",
        headers=crew_headers,
    )
    assert response.status_code == 403

    # The requirement survives.
    inv = json.loads(
        client.get(f"{INVENTORY_ENDPOINT}/{inventory_id}", headers=auth_headers).data
    )
    assert any(r['id'] == req_id for r in inv['requirements'])


def test_proposer_can_remove_own_requirement(client, trip_with_crew):
    """The proposer — here a crew member — can delete the requirement they added."""
    inventory_id = trip_with_crew['trip']['inventory']['id']
    crew_headers = trip_with_crew['crew_headers']

    req_id = json.loads(
        _add_requirement(client, crew_headers, inventory_id, name="Crew tent").data
    )['id']
    response = client.delete(
        f"{INVENTORY_ENDPOINT}/{inventory_id}/requirements/{req_id}",
        headers=crew_headers,
    )
    assert response.status_code == 200


# ---------------------------------------------------------------------------
# Multi-contributor cover & per-member duplicate guard (M6b)
# ---------------------------------------------------------------------------

def test_multiple_members_cover_one_requirement(client, auth_headers, trip_with_crew):
    """Two different members may each contribute their own item to the same
    requirement (e.g. a spare) — both contributions are recorded."""
    inventory_id = trip_with_crew['trip']['inventory']['id']
    crew_headers = trip_with_crew['crew_headers']

    req_id = json.loads(_add_requirement(client, auth_headers, inventory_id).data)['id']
    leader_item = json.loads(
        _create_item(client, auth_headers, inventory_id, name="leader pump").data
    )['id']
    crew_item = json.loads(
        _create_item(client, crew_headers, inventory_id, name="crew pump").data
    )['id']

    client.post(
        f"{INVENTORY_ENDPOINT}/{inventory_id}/requirements/{req_id}/contribute",
        headers=auth_headers, json={"itemId": leader_item},
    )
    resp = client.post(
        f"{INVENTORY_ENDPOINT}/{inventory_id}/requirements/{req_id}/contribute",
        headers=crew_headers, json={"itemId": crew_item},
    )
    assert resp.status_code == 200

    data = json.loads(resp.data)
    assert data['status'] == "covered"
    assert len(data['contributions']) == 2
    assert {c['item']['id'] for c in data['contributions']} == {leader_item, crew_item}

    client.delete(f"{ITEM_ENDPOINT}/{leader_item}", headers=auth_headers)
    client.delete(f"{ITEM_ENDPOINT}/{crew_item}", headers=crew_headers)


def test_duplicate_contribution_same_member_rejected(client, auth_headers, trip_with_crew):
    """A member already covering a requirement cannot add a second item to it (400)."""
    inventory_id = trip_with_crew['trip']['inventory']['id']

    req_id = json.loads(_add_requirement(client, auth_headers, inventory_id).data)['id']
    first = json.loads(_create_item(client, auth_headers, inventory_id, name="pump A").data)['id']
    second = json.loads(_create_item(client, auth_headers, inventory_id, name="pump B").data)['id']

    client.post(
        f"{INVENTORY_ENDPOINT}/{inventory_id}/requirements/{req_id}/contribute",
        headers=auth_headers, json={"itemId": first},
    )
    dup = client.post(
        f"{INVENTORY_ENDPOINT}/{inventory_id}/requirements/{req_id}/contribute",
        headers=auth_headers, json={"itemId": second},
    )
    assert dup.status_code == 400

    client.delete(f"{ITEM_ENDPOINT}/{first}", headers=auth_headers)
    client.delete(f"{ITEM_ENDPOINT}/{second}", headers=auth_headers)


# ---------------------------------------------------------------------------
# Seeded default requirements (M6b §5)
# ---------------------------------------------------------------------------

def test_trip_create_seeds_leader_owned_requirements(client, auth_headers, id, trip_with_crew):
    """A new trip's inventory is pre-seeded with the default requirement set: every
    entry proposed by the leader and initially needed."""
    inventory_id = trip_with_crew['trip']['inventory']['id']
    inv = json.loads(
        client.get(f"{INVENTORY_ENDPOINT}/{inventory_id}", headers=auth_headers).data
    )
    reqs = inv['requirements']

    assert len(reqs) >= 10, "expected a seeded default requirement set"
    assert all(r['status'] == "needed" for r in reqs)
    assert all(r['proposedBy']['user']['id'] == id for r in reqs), "defaults are leader-owned"
    assert "Repair kit" in {r['name'] for r in reqs}
