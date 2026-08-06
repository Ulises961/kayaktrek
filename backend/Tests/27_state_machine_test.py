"""
State machine abuse — S4.

Verifies that trip state transitions cannot be bypassed, triggered out of order,
or used to unlock illegitimate mutations.

State machine: BUILDING → HAPPENING → PAST (forward-only)
ARCHIVED is terminal; only the GDPR erasure task may set it.

§1  State injection via PATCH /api/trip/<id>
      state is dump_only in TripUpdateSchema — the field must be silently ignored.

§2  Crew cannot trigger a state transition
      POST /api/trip/<id>/state decorated with @require_leader → 403 for crew.

§3  Invalid transition attempts → 400
      - Skip:     building → past  (valid target, invalid from-state)
      - Backward: happening → building
      - Same:     building → building
      - Terminal: any → archived (not in _VALID_TRANSITIONS)
      - Unknown:  any → "nonexistent_state"

§4  Mutation on a past trip is blocked
      _require_editable guards exist in logistics, travel_document, shuttle, day, and
      point services alike — all raise ValueError, which day/point/logistics resources
      map to 400 and shuttle/travel_doc map to 403.

Note on error codes: logistics/day/point ValueError → 400; shuttle/travel_doc ValueError
→ 403 (inconsistency in the resource layer; tests assert actual expected behavior).
"""
import json
from uuid import UUID

import pytest

from Api.database import db as _db
from Models.day import Day
from Models.point import Point
from Resources.day_resource import DAY_ENDPOINT
from Resources.inventory_resource import INVENTORY_ENDPOINT
from Resources.item_resource import ITEM_ENDPOINT
from Resources.itinerary_resource import ITINERARY_ENDPOINT
from Resources.logistics_resource import LOGISTICS_ENDPOINT
from Resources.point_resource import POINT_ENDPOINT
from Resources.shuttle_resource import SHUTTLE_ENDPOINT
from Resources.travel_document_resource import TRAVEL_DOCUMENT_ENDPOINT
from Resources.trip_resource import TRIP_ENDPOINT


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_trip(client, headers):
    r = client.post(
        f"{TRIP_ENDPOINT}/create",
        json={
            "inventory": {},
            "itinerary": {
                "isPublic": False,
                "totalMiles": 0,
                "days": [{"dayNumber": 1, "date": "2026-09-01", "points": []}],
            },
        },
        headers=headers,
    )
    assert r.status_code == 201, r.data
    d = json.loads(r.data)
    return d["id"], d["itinerary"]["id"], d["itinerary"]["days"][0]["id"], d["inventory"]["id"]


def _transition(client, trip_id, new_state, headers):
    return client.post(
        f"{TRIP_ENDPOINT}/{trip_id}/state",
        json={"state": new_state},
        headers=headers,
    )


def _get_trip_state(client, trip_id, headers):
    r = client.get(f"{TRIP_ENDPOINT}/{trip_id}", headers=headers)
    assert r.status_code == 200, r.data
    return json.loads(r.data)["state"]


# ---------------------------------------------------------------------------
# §1 — State injection via PATCH
# ---------------------------------------------------------------------------

def test_state_not_settable_via_patch(client, auth_headers):
    """
    PATCH /api/trip/<id> with {"state": "past"} must be silently ignored.
    The trip state must remain "building" after the request.
    """
    trip_id, *_ = _make_trip(client, auth_headers)
    try:
        r = client.patch(
            f"{TRIP_ENDPOINT}/{trip_id}",
            json={"state": "past", "destination": "Elba"},
            headers=auth_headers,
        )
        assert r.status_code == 200, r.data
        assert _get_trip_state(client, trip_id, auth_headers) == "building", (
            "state was mutated via PATCH — TripUpdateSchema must mark state as dump_only"
        )
    finally:
        client.delete(f"{TRIP_ENDPOINT}/{trip_id}", headers=auth_headers)


# ---------------------------------------------------------------------------
# §2 — Crew cannot trigger state transition
# ---------------------------------------------------------------------------

def test_crew_cannot_transition_state(client, auth_headers, auth_headers_2, user_2):
    """
    POST /api/trip/<id>/state is decorated with @require_leader.
    A crew member must receive 403.
    """
    trip_id, *_ = _make_trip(client, auth_headers)
    try:
        r = client.post(f"{TRIP_ENDPOINT}/{trip_id}/invite", json={"userId": str(user_2.id)}, headers=auth_headers)
        assert r.status_code == 201, r.data
        r = client.post(f"{TRIP_ENDPOINT}/{trip_id}/invitation", json={"accepted": True}, headers=auth_headers_2)
        assert r.status_code == 200, r.data

        r = _transition(client, trip_id, "happening", auth_headers_2)
        assert r.status_code == 403, f"crew triggered state transition → {r.status_code}"

        # The denial must be a true no-op: the trip must still be "building".
        assert _get_trip_state(client, trip_id, auth_headers) == "building"
    finally:
        client.delete(f"{TRIP_ENDPOINT}/{trip_id}", headers=auth_headers)


# ---------------------------------------------------------------------------
# §3 — Invalid transition attempts
# ---------------------------------------------------------------------------

def test_invalid_transitions(client, auth_headers):
    """
    All disallowed state transitions must return 400.
    Covers: skip, backward, same-state, terminal (archived), unknown value.
    """
    trip_id, *_ = _make_trip(client, auth_headers)
    try:
        # From BUILDING: skip to past, same-state, terminal archived, unknown
        cases_from_building = [
            ("past",        "skip building→past"),
            ("building",    "same building→building"),
            ("archived",    "terminal building→archived"),
            ("nonexistent", "unknown state value"),
        ]
        for state, label in cases_from_building:
            r = _transition(client, trip_id, state, auth_headers)
            assert r.status_code == 400, f"[{label}] got {r.status_code}, want 400"
        # None of the rejected attempts above may have mutated the trip's actual state.
        assert _get_trip_state(client, trip_id, auth_headers) == "building"

        # Advance to HAPPENING legitimately
        r = _transition(client, trip_id, "happening", auth_headers)
        assert r.status_code == 200, f"legitimate building→happening failed: {r.data}"

        # From HAPPENING: backward to building, skip to archived, same-state
        cases_from_happening = [
            ("building",    "backward happening→building"),
            ("archived",    "terminal happening→archived"),
            ("happening",   "same happening→happening"),
        ]
        for state, label in cases_from_happening:
            r = _transition(client, trip_id, state, auth_headers)
            assert r.status_code == 400, f"[{label}] got {r.status_code}, want 400"
        assert _get_trip_state(client, trip_id, auth_headers) == "happening"

        # Advance to PAST legitimately
        r = _transition(client, trip_id, "past", auth_headers)
        assert r.status_code == 200, f"legitimate happening→past failed: {r.data}"

        # From PAST: all transitions must be blocked
        cases_from_past = [
            ("building",    "backward past→building"),
            ("happening",   "backward past→happening"),
            ("past",        "same past→past"),
            ("archived",    "terminal past→archived"),
        ]
        for state, label in cases_from_past:
            r = _transition(client, trip_id, state, auth_headers)
            assert r.status_code == 400, f"[{label}] got {r.status_code}, want 400"
        assert _get_trip_state(client, trip_id, auth_headers) == "past"
    finally:
        client.delete(f"{TRIP_ENDPOINT}/{trip_id}", headers=auth_headers)


# ---------------------------------------------------------------------------
# §4 — Mutation on a past trip is blocked
# ---------------------------------------------------------------------------

@pytest.fixture(scope="function")
def past_trip(client, auth_headers, category_ids):
    """
    A fully populated trip transitioned all the way to PAST.
    Yields IDs for every mutable sub-resource type.
    """
    trip_id, itin_id, day_id, inv_id = _make_trip(client, auth_headers)

    # Add sub-resources while still in BUILDING
    r = client.post(
        f"{POINT_ENDPOINT}/create",
        json={"dayId": day_id, "type": "stop", "lat": 44.0, "lon": 9.0, "name": "SM Point"},
        headers=auth_headers,
    )
    assert r.status_code == 201, r.data
    point_id = json.loads(r.data)["id"]

    r = client.post(
        f"{TRAVEL_DOCUMENT_ENDPOINT}/{trip_id}/create",
        json={"type": "accommodation", "name": "SM Doc"},
        headers=auth_headers,
    )
    assert r.status_code == 201, r.data
    doc_id = json.loads(r.data)["id"]

    r = client.post(
        f"{SHUTTLE_ENDPOINT}/{trip_id}/create",
        json={"vehicleDescription": "SM Van"},
        headers=auth_headers,
    )
    assert r.status_code == 201, r.data
    vehicle_id = json.loads(r.data)["id"]

    # Transition to PAST
    r = _transition(client, trip_id, "happening", auth_headers)
    assert r.status_code == 200, r.data
    r = _transition(client, trip_id, "past", auth_headers)
    assert r.status_code == 200, r.data

    yield {
        "trip_id": trip_id,
        "itin_id": itin_id,
        "day_id": day_id,
        "inv_id": inv_id,
        "point_id": point_id,
        "doc_id": doc_id,
        "vehicle_id": vehicle_id,
    }

    client.delete(f"{TRIP_ENDPOINT}/{trip_id}", headers=auth_headers)


def test_logistics_blocked_on_past_trip(client, auth_headers, past_trip):
    """PUT /api/logistics/<trip_id> on a past trip → 400 (_require_editable raises ValueError → 400)."""
    r = client.put(
        f"{LOGISTICS_ENDPOINT}/{past_trip['trip_id']}",
        json={"shuttleNotes": "sneaky edit"},
        headers=auth_headers,
    )
    assert r.status_code == 400, f"logistics edit on past trip returned {r.status_code}"


def test_shuttle_vehicle_blocked_on_past_trip(client, auth_headers, past_trip):
    """PATCH /api/shuttle/vehicle/<id> on a past trip → 403 (_require_editable raises ValueError → 403)."""
    r = client.patch(
        f"{SHUTTLE_ENDPOINT}/vehicle/{past_trip['vehicle_id']}",
        json={"vehicleDescription": "sneaky edit"},
        headers=auth_headers,
    )
    assert r.status_code == 403, f"shuttle edit on past trip returned {r.status_code}"


def test_travel_document_blocked_on_past_trip(client, auth_headers, past_trip):
    """
    PATCH /api/travel-document/<id> on a past trip (no date set) → 403.
    _require_editable checks trip.state when doc has no governing date.
    ValueError maps to 403 in travel_document_resource.
    """
    r = client.patch(
        f"{TRAVEL_DOCUMENT_ENDPOINT}/{past_trip['doc_id']}",
        json={"name": "sneaky edit"},
        headers=auth_headers,
    )
    assert r.status_code == 403, f"travel doc edit on past trip returned {r.status_code}"


def test_day_create_blocked_on_past_trip(app, client, auth_headers, past_trip):
    """POST /api/day/create on a past trip's itinerary is rejected, and no Day row
    is left behind by the rejected attempt."""
    with app.app_context():
        day_count_before = _db.session.query(Day).filter_by(
            itinerary_id=UUID(past_trip["itin_id"])
        ).count()

    r = client.post(
        f"{DAY_ENDPOINT}/create",
        json={"itineraryId": past_trip["itin_id"], "dayNumber": 99, "date": "2026-09-02"},
        headers=auth_headers,
    )
    assert r.status_code == 400, f"day create on past trip returned {r.status_code}"

    with app.app_context():
        day_count_after = _db.session.query(Day).filter_by(
            itinerary_id=UUID(past_trip["itin_id"])
        ).count()
        assert day_count_after == day_count_before, "rejected day create must not persist a new Day row"


def test_point_create_blocked_on_past_trip(app, client, auth_headers, past_trip):
    """POST /api/point/create on a past trip's day is rejected, and no Point row is
    left behind by the rejected attempt."""
    with app.app_context():
        point_count_before = _db.session.query(Point).filter_by(
            day_id=UUID(past_trip["day_id"])
        ).count()

    r = client.post(
        f"{POINT_ENDPOINT}/create",
        json={
            "dayId": past_trip["day_id"],
            "type": "stop",
            "lat": 44.0,
            "lon": 9.0,
            "name": "sneaky point",
        },
        headers=auth_headers,
    )
    assert r.status_code == 400, f"point create on past trip returned {r.status_code}"

    with app.app_context():
        point_count_after = _db.session.query(Point).filter_by(
            day_id=UUID(past_trip["day_id"])
        ).count()
        assert point_count_after == point_count_before, "rejected point create must not persist a new Point row"
