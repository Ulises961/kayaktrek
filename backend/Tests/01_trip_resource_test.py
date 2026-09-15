from uuid import UUID
from Resources.trip_resource import TRIP_ENDPOINT
from Resources.itinerary_resource import ITINERARY_ENDPOINT
from Resources.point_resource import POINT_ENDPOINT
from Models.day import Day
from Models.invitation import Invitation
from Models.itinerary import Itinerary
from Models.trip import Trip
from Models.user import User
from Services.itinerary_service import ItineraryService
from Services.Utils.point_ordering import walk_linked_list
from Api.database import db as _db
import json


def _create_trip(client, auth_headers, **kwargs):
    """Helper — create a minimal trip and return the parsed response body."""
    trip = {"inventory": {}, "itinerary": {"isPublic": True, "totalMiles": 0, "days": []}, **kwargs}
    response = client.post(f"{TRIP_ENDPOINT}/create", json=trip, headers=auth_headers)
    assert response.status_code == 201
    return json.loads(response.data)


def test_insert_trip_w_itinerary_and_inventory(client, auth_headers):
    """
    `inventory.items` is a nested payload the real API has never accepted since
    the M6b redesign — InventorySchema has no `items` field (only dump_only
    `requirements`, managed exclusively through dedicated endpoints), and
    BaseSchema's `unknown = EXCLUDE` means the client's nested items are
    silently dropped, not an error. A bare 201 assertion here would never
    reveal that: the request "succeeds" whether or not the payload did
    anything. Assert what actually happened instead — the itinerary was
    created with a staging Day 0 (every dropped point stages into it), and
    the inventory got the leader-seeded default requirements, not the client's
    inert "items".
    """
    itinerary = {"isPublic": True, "totalMiles": 25, "days": []}
    inventory = {"items": [{"category": "travel", "name": "compass"}, {"category": "firstAid", "name": "scissors"}]}
    response = client.post(f"{TRIP_ENDPOINT}/create", json={"inventory": inventory, "itinerary": itinerary}, headers=auth_headers)
    assert response.status_code == 201
    body = json.loads(response.data)

    assert body["itinerary"]["isPublic"] is True
    # totalMiles is dump_only (derived on read from actual route distance —
    # Schemas/itinerary_schema.py's get_total_miles) — the payload's 25 is
    # inert too, same class of finding as the ignored nested inventory items.
    assert body["itinerary"]["totalMiles"] == 0.0
    day0 = (
        _db.session.query(Day)
        .filter_by(itinerary_id=UUID(body["itinerary"]["id"]), day_number=0)
        .first()
    )
    assert day0 is not None

    requirement_names = {r["name"] for r in body["inventory"]["requirements"]}
    assert len(requirement_names) > 0, "a fresh inventory must be seeded with default requirements"
    assert "compass" not in requirement_names
    assert "scissors" not in requirement_names


def test_insert_trip_w_itinerary_and_empty_inventory(client, auth_headers):
    itinerary = {"isPublic": True, "totalMiles": 25, "days": []}
    response = client.post(f"{TRIP_ENDPOINT}/create", json={"inventory": {}, "itinerary": itinerary}, headers=auth_headers)
    assert response.status_code == 201
    body = json.loads(response.data)

    # An explicit empty inventory ({}) still becomes one real Inventory row per
    # trip, seeded with the default requirement set — never left with zero rows.
    assert body["inventory"]["id"] is not None
    assert len(body["inventory"]["requirements"]) > 0


def test_insert_trip_w_o_itinerary(client, auth_headers):
    """
    The real app's trip-creation flow (`frontend/lib/trips/actions.ts`'s
    `createTrip`) never sends a nested itinerary or inventory at all — trip
    metadata is created first, and the itinerary is created later, lazily,
    from the trip detail page's "Create itinerary" button. This is that
    real shape: no `itinerary` key, and an `inventory.items` payload that
    (per the sibling test above) the schema silently ignores anyway.

    `TripService.create_trip` has an explicit fallback that always creates an
    Inventory row even when none is nested in the payload; there is no such
    fallback for itinerary, so a trip created this way has no itinerary at
    all until the user explicitly creates one. Assert that real, current
    consequence — not just that the request routed successfully.
    """
    inventory = {"items": [{"category": "travel", "name": "compass"}]}
    response = client.post(f"{TRIP_ENDPOINT}/create", json={"inventory": inventory}, headers=auth_headers)
    assert response.status_code == 201
    body = json.loads(response.data)

    assert body["itinerary"] is None
    assert body["inventory"]["id"] is not None
    requirement_names = {r["name"] for r in body["inventory"]["requirements"]}
    assert len(requirement_names) > 0
    assert "compass" not in requirement_names

    # The trip is fully usable (retrievable) despite having no itinerary yet.
    fetched = client.get(f"{TRIP_ENDPOINT}/{body['id']}", headers=auth_headers)
    assert fetched.status_code == 200
    assert json.loads(fetched.data)["itinerary"] is None


def test_nested_itinerary_gets_a_staging_day(client, auth_headers):
    """A trip created with a nested itinerary must still get its Day 0.

    TripSchema's nested load builds the Itinerary directly, bypassing
    ItineraryService — the only place Day 0 used to be created. Without it the
    itinerary cannot stage a single point.
    """
    data = _create_trip(client, auth_headers)
    itinerary_id = data["itinerary"]["id"]

    day0 = (
        _db.session.query(Day)
        .filter_by(itinerary_id=UUID(itinerary_id), day_number=0)
        .first()
    )
    assert day0 is not None


def test_nested_itinerary_can_accept_a_point(client, auth_headers):
    """The consequence that actually matters: a nested-created itinerary is usable.

    Asserting the Day 0 row exists proves the fix; this proves it fixes the thing
    it was for — every dropped point stages into Day 0, so an itinerary without
    one silently accepts nothing.
    """
    data = _create_trip(client, auth_headers)
    itinerary_id = data["itinerary"]["id"]

    builder = client.get(f"{ITINERARY_ENDPOINT}/{itinerary_id}", headers=auth_headers)
    assert builder.status_code == 200
    days = json.loads(builder.data)["days"]
    staging = [day for day in days if day["dayNumber"] == 0]
    assert len(staging) == 1

    point = client.post(
        f"{POINT_ENDPOINT}/create",
        json={"dayId": staging[0]["id"], "type": "position", "latitude": 43.5, "longitude": -7.0},
        headers=auth_headers,
    )
    assert point.status_code == 201


def test_staging_day_is_not_duplicated(client, auth_headers):
    """ensure_staging_day is idempotent — a second call reuses the existing Day 0.

    Matters because three creation paths now call it, and two of them run against
    an itinerary that may already have one.
    """
    data = _create_trip(client, auth_headers)
    itinerary_id = UUID(data["itinerary"]["id"])
    itinerary = _db.session.query(Itinerary).filter_by(id=itinerary_id).first()

    first = ItineraryService.ensure_staging_day(itinerary)
    second = ItineraryService.ensure_staging_day(itinerary)

    assert first.id == second.id
    assert (
        _db.session.query(Day)
        .filter_by(itinerary_id=itinerary_id, day_number=0)
        .count()
        == 1
    )


def test_new_trip_defaults_to_building_state(client, auth_headers):
    data = _create_trip(client, auth_headers)
    assert data["state"] == "building"


def test_get_all_trips(client, auth_headers, id):
    response = client.get(f"{TRIP_ENDPOINT}/{id}/all", headers=auth_headers)
    assert response.status_code == 200
    data = json.loads(response.data)
    assert "items" in data and "total" in data


def test_get_trip_by_id(client, auth_headers):
    data = _create_trip(client, auth_headers)
    response = client.get(f"{TRIP_ENDPOINT}/{data['id']}", headers=auth_headers)
    assert response.status_code == 200


def test_get_trip_bumps_last_accessed_at(client, auth_headers):
    """Drives the weather-fetch beat tasks' attention gate (docs/adr/features.md
    §1a, M32) — a real page view must not leave last_accessed_at null forever."""
    data = _create_trip(client, auth_headers)
    trip = _db.session.get(Trip, UUID(data["id"]))
    assert trip.last_accessed_at is None

    response = client.get(f"{TRIP_ENDPOINT}/{data['id']}", headers=auth_headers)
    assert response.status_code == 200

    _db.session.refresh(trip)
    assert trip.last_accessed_at is not None

# --- State machine ---

def test_transition_building_to_happening(client, auth_headers):
    data = _create_trip(client, auth_headers)
    response = client.post(f"{TRIP_ENDPOINT}/{data['id']}/state", json={"state": "happening"}, headers=auth_headers)
    assert response.status_code == 200
    assert json.loads(response.data)["state"] == "happening"


def test_transition_happening_to_past(client, auth_headers):
    data = _create_trip(client, auth_headers)
    client.post(f"{TRIP_ENDPOINT}/{data['id']}/state", json={"state": "happening"}, headers=auth_headers)
    response = client.post(f"{TRIP_ENDPOINT}/{data['id']}/state", json={"state": "past"}, headers=auth_headers)
    assert response.status_code == 200
    assert json.loads(response.data)["state"] == "past"


def test_transition_skipping_state_is_rejected(client, auth_headers):
    data = _create_trip(client, auth_headers)
    response = client.post(f"{TRIP_ENDPOINT}/{data['id']}/state", json={"state": "past"}, headers=auth_headers)
    assert response.status_code == 400


def test_transition_backward_is_rejected(client, auth_headers):
    data = _create_trip(client, auth_headers)
    client.post(f"{TRIP_ENDPOINT}/{data['id']}/state", json={"state": "happening"}, headers=auth_headers)
    response = client.post(f"{TRIP_ENDPOINT}/{data['id']}/state", json={"state": "building"}, headers=auth_headers)
    assert response.status_code == 400


def test_transition_invalid_state_value_is_rejected(client, auth_headers):
    data = _create_trip(client, auth_headers)
    response = client.post(f"{TRIP_ENDPOINT}/{data['id']}/state", json={"state": "flying"}, headers=auth_headers)
    assert response.status_code == 400


def test_transition_missing_state_field_is_rejected(client, auth_headers):
    data = _create_trip(client, auth_headers)
    response = client.post(f"{TRIP_ENDPOINT}/{data['id']}/state", json={}, headers=auth_headers)
    assert response.status_code == 400


# --- Member roles ---

def test_creator_is_stored_as_leader(client, auth_headers):
    data = _create_trip(client, auth_headers)
    assert len(data["travellers"]) == 1
    assert data["travellers"][0]["role"] == "leader"


def test_non_member_cannot_transition_state(client, auth_headers, outsider_headers):
    """A user who is not on the trip gets 403 from require_owner."""
    data = _create_trip(client, auth_headers)
    response = client.post(
        f"{TRIP_ENDPOINT}/{data['id']}/state",
        json={"state": "happening"},
        headers=outsider_headers,
    )
    assert response.status_code == 403


def test_leader_can_transition_state(client, auth_headers):
    """Trip creator (leader) can advance the state."""
    data = _create_trip(client, auth_headers)
    response = client.post(
        f"{TRIP_ENDPOINT}/{data['id']}/state",
        json={"state": "happening"},
        headers=auth_headers,
    )
    assert response.status_code == 200
    assert json.loads(response.data)["state"] == "happening"


def test_crew_cannot_transition_state(client, trip_with_crew):
    """A crew member (on the trip but not leader) is rejected by require_leader."""
    trip_id = trip_with_crew["trip"]["id"]
    response = client.post(
        f"{TRIP_ENDPOINT}/{trip_id}/state",
        json={"state": "happening"},
        headers=trip_with_crew["crew_headers"],
    )
    assert response.status_code == 403


# --- PATCH ---

def test_patch_trip_updates_destination(client, auth_headers):
    data = _create_trip(client, auth_headers)
    response = client.patch(
        f"{TRIP_ENDPOINT}/{data['id']}",
        json={"destination": "Lofoten"},
        headers=auth_headers,
    )
    assert response.status_code == 200
    assert json.loads(response.data)["destination"] == "Lofoten"


def test_patch_trip_updates_dates(client, auth_headers):
    data = _create_trip(client, auth_headers)
    response = client.patch(
        f"{TRIP_ENDPOINT}/{data['id']}",
        json={"dateFrom": "2027-06-01", "dateTo": "2027-06-14"},
        headers=auth_headers,
    )
    assert response.status_code == 200
    body = json.loads(response.data)
    assert body["dateFrom"] == "2027-06-01"
    assert body["dateTo"] == "2027-06-14"


def test_patch_trip_date_to_before_date_from_rejected(client, auth_headers):
    data = _create_trip(client, auth_headers)
    response = client.patch(
        f"{TRIP_ENDPOINT}/{data['id']}",
        json={"dateFrom": "2027-06-14", "dateTo": "2027-06-01"},
        headers=auth_headers,
    )
    assert response.status_code == 400


def test_patch_trip_ignores_unknown_fields(client, auth_headers):
    data = _create_trip(client, auth_headers)
    response = client.patch(
        f"{TRIP_ENDPOINT}/{data['id']}",
        json={"destination": "Iceland", "state": "past"},
        headers=auth_headers,
    )
    assert response.status_code == 200
    body = json.loads(response.data)
    assert body["destination"] == "Iceland"
    assert body["state"] == "building"


def test_non_member_cannot_patch_trip(client, auth_headers, outsider_headers):
    data = _create_trip(client, auth_headers)
    response = client.patch(
        f"{TRIP_ENDPOINT}/{data['id']}",
        json={"destination": "Norway"},
        headers=outsider_headers,
    )
    assert response.status_code == 403

    # The rejected patch must be a true no-op.
    check = client.get(f"{TRIP_ENDPOINT}/{data['id']}", headers=auth_headers)
    assert json.loads(check.data)["destination"] is None


# --- DELETE ---

def test_delete_trip_for_everyone_removes_trip(client, auth_headers):
    data = _create_trip(client, auth_headers)
    trip_id = data["id"]
    response = client.delete(f"{TRIP_ENDPOINT}/{trip_id}", headers=auth_headers)
    assert response.status_code == 200
    assert client.get(f"{TRIP_ENDPOINT}/{trip_id}", headers=auth_headers).status_code == 404


def test_delete_trip_for_everyone_cascades_pending_invitations(client, trip_with_invitation):
    trip_id = trip_with_invitation["trip"]["id"]

    response = client.delete(f"{TRIP_ENDPOINT}/{trip_id}", headers=trip_with_invitation["leader_headers"])
    assert response.status_code == 200

    remaining = _db.session.query(Invitation).filter_by(trip_id=UUID(trip_id)).all()
    assert remaining == []


def test_leave_trip_as_sole_member_removes_trip(client, auth_headers):
    data = _create_trip(client, auth_headers)
    trip_id = data["id"]
    response = client.post(f"{TRIP_ENDPOINT}/{trip_id}/leave", headers=auth_headers)
    assert response.status_code == 200
    assert client.get(f"{TRIP_ENDPOINT}/{trip_id}", headers=auth_headers).status_code == 404


def test_non_member_cannot_delete_trip(client, auth_headers, outsider_headers):
    data = _create_trip(client, auth_headers)
    response = client.delete(f"{TRIP_ENDPOINT}/{data['id']}", headers=outsider_headers)
    assert response.status_code == 403

    # The rejected delete must be a true no-op — the trip still exists.
    assert client.get(f"{TRIP_ENDPOINT}/{data['id']}", headers=auth_headers).status_code == 200


# --- Invitation flow ---

def test_invited_user_appears_in_pending_travellers(client, trip_with_invitation):
    trip_id = trip_with_invitation["trip"]["id"]
    response = client.get(f"{TRIP_ENDPOINT}/{trip_id}", headers=trip_with_invitation["leader_headers"])
    body = json.loads(response.data)
    pending_ids = [u["id"] for u in body["pendingTravellers"]]
    assert trip_with_invitation["invitee_id"] in pending_ids


def test_invite_already_member_returns_409(client, trip_with_user2_as_crew):
    trip_id = trip_with_user2_as_crew["trip"]["id"]
    response = client.post(
        f"{TRIP_ENDPOINT}/{trip_id}/invite",
        json={"userId": trip_with_user2_as_crew["crew_id"]},
        headers=trip_with_user2_as_crew["leader_headers"],
    )
    assert response.status_code == 409


def test_duplicate_pending_invitation_returns_409(client, trip_with_invitation):
    trip_id = trip_with_invitation["trip"]["id"]
    response = client.post(
        f"{TRIP_ENDPOINT}/{trip_id}/invite",
        json={"userId": trip_with_invitation["invitee_id"]},
        headers=trip_with_invitation["leader_headers"],
    )
    assert response.status_code == 409


def test_non_leader_cannot_invite(client, trip_with_invitation):
    trip_id = trip_with_invitation["trip"]["id"]
    response = client.post(
        f"{TRIP_ENDPOINT}/{trip_id}/invite",
        json={"userId": trip_with_invitation["invitee_id"]},
        headers=trip_with_invitation["invitee_headers"],
    )
    assert response.status_code == 403


def test_invitee_accepts_becomes_crew(client, trip_with_invitation):
    trip_id = trip_with_invitation["trip"]["id"]
    response = client.post(
        f"{TRIP_ENDPOINT}/{trip_id}/invitation",
        json={"accepted": True},
        headers=trip_with_invitation["invitee_headers"],
    )
    assert response.status_code == 200

    body = json.loads(client.get(f"{TRIP_ENDPOINT}/{trip_id}", headers=trip_with_invitation["leader_headers"]).data)
    member_ids = [m["user"]["id"] for m in body["travellers"]]
    pending_ids = [u["id"] for u in body["pendingTravellers"]]
    assert trip_with_invitation["invitee_id"] in member_ids
    assert trip_with_invitation["invitee_id"] not in pending_ids


def test_invitee_declines_not_added_to_travellers(client, trip_with_invitation):
    trip_id = trip_with_invitation["trip"]["id"]
    response = client.post(
        f"{TRIP_ENDPOINT}/{trip_id}/invitation",
        json={"accepted": False},
        headers=trip_with_invitation["invitee_headers"],
    )
    assert response.status_code == 200

    body = json.loads(client.get(f"{TRIP_ENDPOINT}/{trip_id}", headers=trip_with_invitation["leader_headers"]).data)
    member_ids = [m["user"]["id"] for m in body["travellers"]]
    pending_ids = [u["id"] for u in body["pendingTravellers"]]
    assert trip_with_invitation["invitee_id"] not in member_ids
    assert trip_with_invitation["invitee_id"] not in pending_ids


def test_leader_cancels_invitation(client, trip_with_invitation):
    trip_id = trip_with_invitation["trip"]["id"]
    invitee_id = trip_with_invitation["invitee_id"]

    response = client.delete(
        f"{TRIP_ENDPOINT}/{trip_id}/invite/{invitee_id}",
        headers=trip_with_invitation["leader_headers"],
    )
    assert response.status_code == 200

    body = json.loads(client.get(f"{TRIP_ENDPOINT}/{trip_id}", headers=trip_with_invitation["leader_headers"]).data)
    assert invitee_id not in [u["id"] for u in body["pendingTravellers"]]


def test_accept_nonexistent_invitation_returns_404(client, auth_headers):
    data = _create_trip(client, auth_headers)
    response = client.post(
        f"{TRIP_ENDPOINT}/{data['id']}/invitation",
        json={"accepted": True},
        headers=auth_headers,
    )
    assert response.status_code == 404


# --- Member removal ---

def test_leader_removes_crew_member(client, trip_with_user2_as_crew):
    trip_id = trip_with_user2_as_crew["trip"]["id"]
    crew_id = trip_with_user2_as_crew["crew_id"]

    response = client.delete(
        f"{TRIP_ENDPOINT}/{trip_id}/member/{crew_id}",
        headers=trip_with_user2_as_crew["leader_headers"],
    )
    assert response.status_code == 200

    body = json.loads(client.get(f"{TRIP_ENDPOINT}/{trip_id}", headers=trip_with_user2_as_crew["leader_headers"]).data)
    assert crew_id not in [m["user"]["id"] for m in body["travellers"]]


def test_leader_cannot_remove_self(client, trip_with_user2_as_crew, id):
    trip_id = trip_with_user2_as_crew["trip"]["id"]
    response = client.delete(
        f"{TRIP_ENDPOINT}/{trip_id}/member/{id}",
        headers=trip_with_user2_as_crew["leader_headers"],
    )
    assert response.status_code == 409

    # The rejected self-removal must be a true no-op — the leader is still on the trip.
    body = json.loads(client.get(f"{TRIP_ENDPOINT}/{trip_id}", headers=trip_with_user2_as_crew["leader_headers"]).data)
    assert id in [m["user"]["id"] for m in body["travellers"]]


def test_non_leader_cannot_remove_member(client, trip_with_user2_as_crew, id):
    trip_id = trip_with_user2_as_crew["trip"]["id"]
    response = client.delete(
        f"{TRIP_ENDPOINT}/{trip_id}/member/{id}",
        headers=trip_with_user2_as_crew["crew_headers"],
    )
    assert response.status_code == 403

    # The rejected removal must be a true no-op — the leader is still on the trip.
    body = json.loads(client.get(f"{TRIP_ENDPOINT}/{trip_id}", headers=trip_with_user2_as_crew["leader_headers"]).data)
    assert id in [m["user"]["id"] for m in body["travellers"]]


def test_remove_nonmember_returns_404(client, auth_headers, outsider_headers):
    data = _create_trip(client, auth_headers)
    outsider = User.query.filter_by(mail="outsider.tmp@example.com").first()
    outsider_id = str(outsider.id) if outsider else "00000000-0000-0000-0000-000000000000"
    response = client.delete(
        f"{TRIP_ENDPOINT}/{data['id']}/member/{outsider_id}",
        headers=auth_headers,
    )
    assert response.status_code == 404


def test_nested_create_chains_points_in_payload_order(client, auth_headers):
    """A nested itinerary's point array order must become the route's next_id chain.

    TripSchema builds nested days/points straight from the payload, bypassing
    ItineraryService — and nothing used to write the array's order into the
    linked list. Every point then landed as a disconnected head, so readers
    (walk_linked_list, and compute_total_miles through it) fell back to sorting
    by str(id). UUIDv7 makes that creation order only while the timestamp
    prefixes differ; points written in the same millisecond — which is what a
    single nested create does — tie there and sort by their random bits.

    So the bug was not that the order was wrong, but that it was *undefined*:
    the same payload produced different distances run to run. Asserting the
    chain rather than a resulting distance is what pins it, because a distance
    assertion passes whenever the coin lands the right way up.
    """
    itinerary = {
        "isPublic": True,
        "totalMiles": 0,
        "days": [
            {
                "dayNumber": 1,
                "date": "2026-07-15",
                "points": [
                    {"latitude": 48.40, "longitude": -123.35, "name": "Launch", "type": "stop"},
                    {"latitude": 48.45, "longitude": -123.30, "name": "Waypoint", "type": "position"},
                    {"latitude": 48.50, "longitude": -123.25, "name": "Camp", "type": "stop"},
                ],
            }
        ],
    }
    response = client.post(
        f"{TRIP_ENDPOINT}/create",
        json={"inventory": {}, "itinerary": itinerary},
        headers=auth_headers,
    )
    assert response.status_code == 201
    itinerary_id = UUID(json.loads(response.data)["itinerary"]["id"])

    day = (
        _db.session.query(Day)
        .filter_by(itinerary_id=itinerary_id, day_number=1)
        .one()
    )
    by_name = {point.name: point for point in day.points}
    assert set(by_name) == {"Launch", "Waypoint", "Camp"}

    assert by_name["Launch"].next_id == by_name["Waypoint"].id
    assert by_name["Waypoint"].next_id == by_name["Camp"].id
    assert by_name["Camp"].next_id is None, "the last point terminates the chain"

    # And the chain is what the readers actually walk.
    assert walk_linked_list(list(day.points)) == [
        str(by_name["Launch"].id),
        str(by_name["Waypoint"].id),
        str(by_name["Camp"].id),
    ]

