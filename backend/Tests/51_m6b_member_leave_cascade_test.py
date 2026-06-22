"""
Member-leave cascade (M6b): deleting a TripMember removes the requirements they
proposed, their contributions, and their private packing entries — but never their
personal gear-closet Items, which are user-owned and decoupled from trip membership.
"""

import json
from uuid import UUID

from Resources.inventory_resource import INVENTORY_ENDPOINT
from Resources.item_resource import ITEM_ENDPOINT
from Resources.trip_resource import TRIP_ENDPOINT
from Resources.personal_packing_resource import PACKING_ENDPOINT
from Api.database import db as _db
from Models.personal_packing_item import PersonalPackingItem


def test_member_leave_cascades_entries_but_keeps_items(app, client, auth_headers, trip_with_crew):
    trip = trip_with_crew['trip']
    trip_id = trip['id']
    inventory_id = trip['inventory']['id']
    crew_headers = trip_with_crew['crew_headers']

    # A leader-seeded requirement (captured before crew adds any of their own, so it
    # is unambiguously leader-proposed and must survive the crew leaving).
    seeded_req_id = json.loads(
        client.get(f"{INVENTORY_ENDPOINT}/{inventory_id}", headers=auth_headers).data
    )['requirements'][0]['id']

    # Crew proposes a requirement of their own.
    crew_req_id = json.loads(client.post(
        f"{INVENTORY_ENDPOINT}/{inventory_id}/requirements",
        headers=crew_headers, json={"name": "Crew satphone", "category": "gear"},
    ).data)['id']
    contrib_item_id = json.loads(client.post(
        f"{ITEM_ENDPOINT}/create", headers=crew_headers,
        json={"name": "crew firstaid", "status": "owned"},
    ).data)['id']
    client.post(
        f"{INVENTORY_ENDPOINT}/{inventory_id}/requirements/{seeded_req_id}/contribute",
        headers=crew_headers, json={"itemId": contrib_item_id},
    )

    # Crew adds a private packing entry.
    pack_item_id = json.loads(client.post(
        f"{ITEM_ENDPOINT}/create", headers=crew_headers,
        json={"name": "crew thermos", "status": "owned"},
    ).data)['id']
    client.post(
        f"{PACKING_ENDPOINT}/create", headers=crew_headers,
        json={"tripId": trip_id, "itemId": pack_item_id},
    )

    # Crew leaves the trip — their TripMember is deleted, cascading.
    assert client.delete(
        f"{TRIP_ENDPOINT}/{trip_id}?for_everyone=false", headers=crew_headers
    ).status_code == 200

    # The requirement the crew proposed is gone, and their contribution cascaded
    # away (the seeded requirement reverts to needed via derived status).
    inv = json.loads(client.get(f"{INVENTORY_ENDPOINT}/{inventory_id}", headers=auth_headers).data)
    req_by_id = {r['id']: r for r in inv['requirements']}
    assert crew_req_id not in req_by_id
    assert req_by_id[seeded_req_id]['status'] == "needed"
    assert req_by_id[seeded_req_id]['contributions'] == []

    # Private packing entries cascaded away too.
    with app.app_context():
        remaining = _db.session.query(PersonalPackingItem).filter_by(
            item_id=UUID(pack_item_id)
        ).count()
        assert remaining == 0

    # But the crew's personal gear-closet Items survive — leaving a trip never
    # touches what you own.
    crew_item_ids = {
        i['id'] for i in json.loads(client.get(f"{ITEM_ENDPOINT}/all", headers=crew_headers).data)
    }
    assert {contrib_item_id, pack_item_id} <= crew_item_ids
