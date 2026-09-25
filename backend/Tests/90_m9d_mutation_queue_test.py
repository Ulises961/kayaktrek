"""M9d WP1 — the offline mutation batch endpoint.

POST /api/v1/sync/mutations: a phone that was offline sends the changes it queued, as
envelopes. Each is applied through the ordinary service layer, in the order it was made
on the device, in its own transaction, and exactly once however often the batch is
retried (plans/M9d.md, docs/adr/mobile-offline.md "Sync up").
"""
import json
from datetime import datetime, timedelta, timezone
from uuid import UUID

import uuid_extension

from Api.database import db
from Models.log import Log
from Models.personal_packing_item import PersonalPackingItem
from Models.processed_mutation import ProcessedMutation
from Models.requirement_contribution import RequirementContribution
from Models.trip import Trip, TripStateType
from Models.trip_member import TripMember
from Resources.inventory_resource import INVENTORY_ENDPOINT
from Resources.item_resource import ITEM_ENDPOINT
from Resources.mobile_sync_resource import MOBILE_SYNC_ENDPOINT
from Services.logistics_service import LogisticsService
from Services.mutation_queue_service import RETENTION, MutationQueueService

MUTATIONS_URL = f"{MOBILE_SYNC_ENDPOINT}/mutations"
_BASE_TIME = datetime(2026, 9, 25, 10, 0, tzinfo=timezone.utc)


def _envelope(entity_type, operation, entity_id=None, payload=None, minutes=0, mutation_id=None):
    return {
        "mutationId": str(mutation_id or uuid_extension.uuid7()),
        "entityType": entity_type,
        "operation": operation,
        "entityId": str(entity_id or uuid_extension.uuid7()),
        "payload": payload or {},
        "deviceTimestamp": (_BASE_TIME + timedelta(minutes=minutes)).isoformat(),
    }


def _send(client, headers, *envelopes):
    return client.post(MUTATIONS_URL, headers=headers, json={"mutations": list(envelopes)})


def _results(response):
    assert response.status_code == 200, response.data
    return {result["mutationId"]: result for result in response.json["results"]}


def _member_id(app, trip_id):
    with app.app_context():
        members = db.session.query(TripMember).filter_by(trip_id=UUID(trip_id)).all()
        return {member.role.value: str(member.id) for member in members}


def _owned_item(client, headers, trip):
    return json.loads(
        client.post(
            f"{ITEM_ENDPOINT}/create",
            headers=headers,
            json={
                "inventoryId": trip["inventory"]["id"],
                "name": "spare paddle",
                "category": "travel",
                "status": "owned",
            },
        ).data
    )["id"]


def _set_state(app, trip_id, state, is_paused=False):
    with app.app_context():
        trip = db.session.get(Trip, UUID(trip_id))
        trip.state = state
        trip.is_paused = is_paused
        db.session.commit()


# ── the endpoint itself ───────────────────────────────────────────────────


def test_requires_authentication(client):
    assert client.post(MUTATIONS_URL, json={"mutations": []}).status_code == 401


def test_rejects_a_body_without_a_mutations_list(client, auth_headers):
    assert client.post(MUTATIONS_URL, headers=auth_headers, json={"changes": {}}).status_code == 400


def test_an_empty_batch_is_fine(client, auth_headers):
    response = _send(client, auth_headers)
    assert response.status_code == 200
    assert response.json["results"] == []


def test_rejects_an_unknown_kind_of_change_without_guessing(client, auth_headers):
    envelope = _envelope("weather", "update")

    result = _results(_send(client, auth_headers, envelope))[envelope["mutationId"]]

    assert result["status"] == "rejected"
    assert "weather" in result["reason"]


def test_rejects_a_malformed_envelope_but_applies_the_rest(client, app, trip_with_crew):
    trip = trip_with_crew["trip"]
    member_id = _member_id(app, trip["id"])["crew"]
    broken = {"mutationId": "not-a-uuid", "entityType": "trip_member", "operation": "update"}
    good = _envelope(
        "trip_member", "update", member_id, {"tripId": trip["id"], "vesselMake": "Valley"}
    )

    response = _send(client, trip_with_crew["crew_headers"], broken, good)

    assert response.status_code == 200
    statuses = [result["status"] for result in response.json["results"]]
    assert statuses.count("rejected") == 1
    assert _results(response)[good["mutationId"]]["status"] == "applied"


# ── exactly once, in order, each on its own ───────────────────────────────


def test_a_retried_batch_applies_each_change_once(client, app, trip_with_crew):
    """The whole reason for the processed-mutations table: a phone that lost signal
    mid-request resends the batch, and nothing may happen twice."""
    trip = trip_with_crew["trip"]
    headers = trip_with_crew["leader_headers"]
    item_id = _owned_item(client, headers, trip)
    add = _envelope("packing_item", "create", payload={"tripId": trip["id"], "itemId": item_id})

    first = _results(_send(client, headers, add))
    second = _results(_send(client, headers, add))

    assert first[add["mutationId"]]["status"] == "applied"
    assert second[add["mutationId"]]["status"] == "duplicate"
    with app.app_context():
        assert db.session.query(PersonalPackingItem).filter_by(item_id=UUID(item_id)).count() == 1


def test_changes_apply_in_the_order_they_were_made_not_the_order_sent(client, app, trip_with_crew):
    trip = trip_with_crew["trip"]
    member_id = _member_id(app, trip["id"])["crew"]
    earlier = _envelope(
        "trip_member", "update", member_id, {"tripId": trip["id"], "vesselModel": "Etain"}, minutes=1
    )
    later = _envelope(
        "trip_member", "update", member_id, {"tripId": trip["id"], "vesselModel": "Gemini"}, minutes=5
    )

    _send(client, trip_with_crew["crew_headers"], later, earlier)

    with app.app_context():
        assert db.session.get(TripMember, UUID(member_id)).vessel_model == "Gemini"


def test_one_rejected_change_does_not_undo_the_others(client, app, trip_with_crew):
    trip = trip_with_crew["trip"]
    members = _member_id(app, trip["id"])
    headers = trip_with_crew["crew_headers"]
    # A crew member may not edit the leader's float plan.
    forbidden = _envelope(
        "trip_member", "update", members["leader"], {"tripId": trip["id"], "vesselMake": "X"}, minutes=1
    )
    own = _envelope(
        "trip_member", "update", members["crew"], {"tripId": trip["id"], "vesselMake": "Prijon"}, minutes=2
    )

    results = _results(_send(client, headers, forbidden, own))

    assert results[forbidden["mutationId"]]["status"] == "rejected"
    assert results[own["mutationId"]]["status"] == "applied"
    with app.app_context():
        assert db.session.get(TripMember, UUID(members["crew"])).vessel_make == "Prijon"
        assert db.session.get(TripMember, UUID(members["leader"])).vessel_make != "X"


def test_a_rejected_change_stays_rejected_on_retry(client, trip_with_crew, app):
    trip = trip_with_crew["trip"]
    leader_member = _member_id(app, trip["id"])["leader"]
    forbidden = _envelope(
        "trip_member", "update", leader_member, {"tripId": trip["id"], "vesselMake": "X"}
    )
    headers = trip_with_crew["crew_headers"]

    _send(client, headers, forbidden)
    retry = _results(_send(client, headers, forbidden))[forbidden["mutationId"]]

    assert retry["status"] == "duplicate"
    assert retry["result"] == "rejected"


def test_another_users_mutation_id_is_not_reported_back(client, app, trip_with_crew):
    trip = trip_with_crew["trip"]
    member_id = _member_id(app, trip["id"])["crew"]
    envelope = _envelope("trip_member", "update", member_id, {"tripId": trip["id"], "vesselMake": "A"})
    _send(client, trip_with_crew["crew_headers"], envelope)

    result = _results(_send(client, trip_with_crew["leader_headers"], envelope))[envelope["mutationId"]]

    assert result["status"] == "rejected"


def test_records_what_was_applied(client, app, trip_with_crew):
    trip = trip_with_crew["trip"]
    member_id = _member_id(app, trip["id"])["crew"]
    envelope = _envelope("trip_member", "update", member_id, {"tripId": trip["id"], "vesselMake": "B"})

    _send(client, trip_with_crew["crew_headers"], envelope)

    with app.app_context():
        record = db.session.get(ProcessedMutation, UUID(envelope["mutationId"]))
        assert record is not None
        assert record.status == "applied"
        assert record.entity_type == "trip_member"


def test_prune_forgets_only_what_is_past_the_retention_window(client, app, trip_with_crew):
    trip = trip_with_crew["trip"]
    member_id = _member_id(app, trip["id"])["crew"]
    old = _envelope("trip_member", "update", member_id, {"tripId": trip["id"], "vesselMake": "C"})
    recent = _envelope("trip_member", "update", member_id, {"tripId": trip["id"], "vesselMake": "D"})
    _send(client, trip_with_crew["crew_headers"], old, recent)

    with app.app_context():
        record = db.session.get(ProcessedMutation, UUID(old["mutationId"]))
        record.created = datetime.now(timezone.utc) - RETENTION - timedelta(days=1)
        db.session.commit()

        MutationQueueService.prune()

        assert db.session.get(ProcessedMutation, UUID(old["mutationId"])) is None
        assert db.session.get(ProcessedMutation, UUID(recent["mutationId"])) is not None


# ── own float-plan fields ─────────────────────────────────────────────────


def test_updates_own_float_plan_fields(client, app, trip_with_crew):
    trip = trip_with_crew["trip"]
    member_id = _member_id(app, trip["id"])["crew"]
    envelope = _envelope(
        "trip_member",
        "update",
        member_id,
        {"tripId": trip["id"], "emergencyContactName": "Marta", "emergencyContactPhone": "+34600"},
    )

    _send(client, trip_with_crew["crew_headers"], envelope)

    with app.app_context():
        member = db.session.get(TripMember, UUID(member_id))
        assert member.emergency_contact_name == "Marta"
        assert member.emergency_contact_phone == "+34600"


# ── kit (personal packing list) ───────────────────────────────────────────


def test_packing_item_created_offline_keeps_the_phones_id(client, app, trip_with_crew):
    """Later queued changes (a tick, a removal) refer to the entry by the id the phone
    gave it before the server had seen it."""
    trip = trip_with_crew["trip"]
    headers = trip_with_crew["leader_headers"]
    item_id = _owned_item(client, headers, trip)
    entry_id = uuid_extension.uuid7()
    add = _envelope(
        "packing_item", "create", entry_id, {"tripId": trip["id"], "itemId": item_id}, minutes=1
    )
    tick = _envelope("packing_item", "update", entry_id, {"checked": True}, minutes=2)

    results = _results(_send(client, headers, add, tick))

    assert results[add["mutationId"]]["status"] == "applied"
    assert results[tick["mutationId"]]["status"] == "applied"
    with app.app_context():
        entry = db.session.get(PersonalPackingItem, entry_id)
        assert entry is not None
        assert entry.checked is True


def test_packing_item_removed_offline(client, app, trip_with_crew):
    trip = trip_with_crew["trip"]
    headers = trip_with_crew["leader_headers"]
    item_id = _owned_item(client, headers, trip)
    entry_id = uuid_extension.uuid7()
    add = _envelope("packing_item", "create", entry_id, {"tripId": trip["id"], "itemId": item_id}, minutes=1)
    remove = _envelope("packing_item", "delete", entry_id, minutes=2)

    _send(client, headers, add, remove)

    with app.app_context():
        assert db.session.get(PersonalPackingItem, entry_id) is None


def test_cannot_tick_someone_elses_packing_item(client, app, trip_with_crew):
    trip = trip_with_crew["trip"]
    item_id = _owned_item(client, trip_with_crew["leader_headers"], trip)
    entry_id = uuid_extension.uuid7()
    _send(
        client,
        trip_with_crew["leader_headers"],
        _envelope("packing_item", "create", entry_id, {"tripId": trip["id"], "itemId": item_id}),
    )
    tick = _envelope("packing_item", "update", entry_id, {"checked": True})

    result = _results(_send(client, trip_with_crew["crew_headers"], tick))[tick["mutationId"]]

    assert result["status"] == "rejected"


# ── logs ──────────────────────────────────────────────────────────────────


def test_log_written_at_camp_then_edited_before_it_was_sent(client, app, auth_headers):
    log_id = uuid_extension.uuid7()
    create = _envelope("log", "create", log_id, {"date": "2026-09-20", "distance": 12.5}, minutes=1)
    edit = _envelope("log", "update", log_id, {"notes": "Headwind all afternoon."}, minutes=2)

    results = _results(_send(client, auth_headers, create, edit))

    assert results[create["mutationId"]]["status"] == "applied"
    assert results[edit["mutationId"]]["status"] == "applied"
    with app.app_context():
        log = db.session.get(Log, log_id)
        assert log is not None
        assert log.distance == 12.5
        assert log.notes == "Headwind all afternoon."
        db.session.delete(log)
        db.session.commit()


def test_cannot_delete_someone_elses_log(client, app, auth_headers, auth_headers_2):
    log_id = uuid_extension.uuid7()
    _send(client, auth_headers, _envelope("log", "create", log_id, {"date": "2026-09-20"}))
    delete = _envelope("log", "delete", log_id)

    result = _results(_send(client, auth_headers_2, delete))[delete["mutationId"]]

    assert result["status"] == "rejected"
    with app.app_context():
        log = db.session.get(Log, log_id)
        assert log is not None
        db.session.delete(log)
        db.session.commit()


# ── trip state and end date (leader, trip under way) ──────────────────────


def test_leader_pauses_a_trip_under_way(client, app, trip_with_crew):
    trip = trip_with_crew["trip"]
    _set_state(app, trip["id"], TripStateType.HAPPENING)
    pause = _envelope("trip", "update", trip["id"], {"action": "pause"})

    result = _results(_send(client, trip_with_crew["leader_headers"], pause))[pause["mutationId"]]

    assert result["status"] == "applied"
    with app.app_context():
        assert db.session.get(Trip, UUID(trip["id"])).is_paused is True


def test_crew_cannot_pause_the_trip(client, app, trip_with_crew):
    trip = trip_with_crew["trip"]
    _set_state(app, trip["id"], TripStateType.HAPPENING)
    pause = _envelope("trip", "update", trip["id"], {"action": "pause"})

    result = _results(_send(client, trip_with_crew["crew_headers"], pause))[pause["mutationId"]]

    assert result["status"] == "rejected"
    with app.app_context():
        assert db.session.get(Trip, UUID(trip["id"])).is_paused is False


def test_a_queued_change_to_a_trip_finished_meanwhile_is_rejected_with_the_reason(
    client, app, trip_with_crew
):
    """Queued at sea, arriving after someone finished the trip on the web: the
    transition is no longer legal, and the phone is told why."""
    trip = trip_with_crew["trip"]
    _set_state(app, trip["id"], TripStateType.PAST)
    pause = _envelope("trip", "update", trip["id"], {"action": "pause"})

    result = _results(_send(client, trip_with_crew["leader_headers"], pause))[pause["mutationId"]]

    assert result["status"] == "rejected"
    assert result["reason"]


def test_leader_finishes_the_trip(client, app, trip_with_crew):
    trip = trip_with_crew["trip"]
    _set_state(app, trip["id"], TripStateType.HAPPENING)
    finish = _envelope("trip", "update", trip["id"], {"action": "finish"})

    _send(client, trip_with_crew["leader_headers"], finish)

    with app.app_context():
        assert db.session.get(Trip, UUID(trip["id"])).state == TripStateType.PAST


def test_leader_extends_the_end_date_of_a_trip_under_way(client, app, trip_with_crew):
    trip = trip_with_crew["trip"]
    _set_state(app, trip["id"], TripStateType.HAPPENING)
    extend = _envelope("trip", "update", trip["id"], {"dateTo": "2026-10-04"})

    result = _results(_send(client, trip_with_crew["leader_headers"], extend))[extend["mutationId"]]

    assert result["status"] == "applied"
    with app.app_context():
        assert db.session.get(Trip, UUID(trip["id"])).date_to.isoformat() == "2026-10-04"


def test_end_date_is_not_changed_offline_before_the_trip_starts(client, app, trip_with_crew):
    """Only a trip under way extends offline (ADR). Planning changes wait for signal."""
    trip = trip_with_crew["trip"]
    extend = _envelope("trip", "update", trip["id"], {"dateTo": "2026-10-04"})

    result = _results(_send(client, trip_with_crew["leader_headers"], extend))[extend["mutationId"]]

    assert result["status"] == "rejected"


# ── group checklist contributions ─────────────────────────────────────────


def _requirement(client, headers, trip):
    return json.loads(
        client.post(
            f"{INVENTORY_ENDPOINT}/{trip['inventory']['id']}/requirements",
            headers=headers,
            json={"name": "Tow line", "category": "safety"},
        ).data
    )["id"]


def test_contributes_to_the_group_checklist_and_withdraws(client, app, trip_with_crew):
    """Named by trip, not inventory: offline the phone may never have seen the
    inventory's id, which only arrives with a live trip fetch."""
    trip = trip_with_crew["trip"]
    headers = trip_with_crew["leader_headers"]
    requirement_id = _requirement(client, headers, trip)
    item_id = _owned_item(client, headers, trip)
    contribute = _envelope(
        "contribution", "create", requirement_id, {"tripId": trip["id"], "itemId": item_id}, minutes=1
    )

    _send(client, headers, contribute)
    with app.app_context():
        assert db.session.query(RequirementContribution).filter_by(requirement_id=UUID(requirement_id)).count() == 1

    withdraw = _envelope("contribution", "delete", requirement_id, {"tripId": trip["id"]}, minutes=2)
    result = _results(_send(client, headers, withdraw))[withdraw["mutationId"]]

    assert result["status"] == "applied"
    with app.app_context():
        assert db.session.query(RequirementContribution).filter_by(requirement_id=UUID(requirement_id)).count() == 0


def test_cannot_contribute_someone_elses_gear(client, trip_with_crew):
    trip = trip_with_crew["trip"]
    requirement_id = _requirement(client, trip_with_crew["leader_headers"], trip)
    leaders_item = _owned_item(client, trip_with_crew["leader_headers"], trip)
    contribute = _envelope(
        "contribution",
        "create",
        requirement_id,
        {"tripId": trip["id"], "itemId": leaders_item},
    )

    result = _results(_send(client, trip_with_crew["crew_headers"], contribute))[contribute["mutationId"]]

    assert result["status"] == "rejected"


# ── crew drop-out ─────────────────────────────────────────────────────────


def test_leader_records_that_a_paddler_left_the_trip(client, app, trip_with_crew):
    """So the float plan and shore contact know who is actually on the water."""
    trip = trip_with_crew["trip"]
    _set_state(app, trip["id"], TripStateType.HAPPENING)
    crew_member = _member_id(app, trip["id"])["crew"]
    departure = _envelope(
        "crew_departure", "create", crew_member, {"tripId": trip["id"], "note": "Wrist injury, taken off at Cala Montjoi"}
    )

    result = _results(_send(client, trip_with_crew["leader_headers"], departure))[departure["mutationId"]]

    assert result["status"] == "applied"
    with app.app_context():
        member = db.session.get(TripMember, UUID(crew_member))
        # When it happened on the phone, not when the server heard.
        assert member.left_at == _BASE_TIME
        assert member.left_note == "Wrist injury, taken off at Cala Montjoi"


def test_a_recorded_departure_is_undone(client, app, trip_with_crew):
    trip = trip_with_crew["trip"]
    _set_state(app, trip["id"], TripStateType.HAPPENING)
    crew_member = _member_id(app, trip["id"])["crew"]
    headers = trip_with_crew["leader_headers"]
    _send(client, headers, _envelope("crew_departure", "create", crew_member, {"tripId": trip["id"]}, minutes=1))

    _send(client, headers, _envelope("crew_departure", "delete", crew_member, {"tripId": trip["id"]}, minutes=2))

    with app.app_context():
        member = db.session.get(TripMember, UUID(crew_member))
        assert member.left_at is None
        assert member.left_note is None


def test_crew_cannot_record_a_departure(client, app, trip_with_crew):
    trip = trip_with_crew["trip"]
    _set_state(app, trip["id"], TripStateType.HAPPENING)
    leader_member = _member_id(app, trip["id"])["leader"]
    departure = _envelope("crew_departure", "create", leader_member, {"tripId": trip["id"]})

    result = _results(_send(client, trip_with_crew["crew_headers"], departure))[departure["mutationId"]]

    assert result["status"] == "rejected"


def test_a_departure_is_only_recorded_on_a_trip_under_way(client, app, trip_with_crew):
    trip = trip_with_crew["trip"]
    crew_member = _member_id(app, trip["id"])["crew"]
    departure = _envelope("crew_departure", "create", crew_member, {"tripId": trip["id"]})

    result = _results(_send(client, trip_with_crew["leader_headers"], departure))[departure["mutationId"]]

    assert result["status"] == "rejected"


def test_a_float_plan_shared_after_a_departure_shows_it(client, app, trip_with_crew):
    """The shore contact's float plan is a snapshot taken when it is shared (ADR-022);
    one built after a departure says who has left the water."""
    trip = trip_with_crew["trip"]
    _set_state(app, trip["id"], TripStateType.HAPPENING)
    crew_member = _member_id(app, trip["id"])["crew"]
    _send(
        client,
        trip_with_crew["leader_headers"],
        _envelope("crew_departure", "create", crew_member, {"tripId": trip["id"], "note": "Evacuated"}),
    )

    with app.app_context():
        snapshot = LogisticsService.build_snapshot(trip["id"])

    departed = next(member for member in snapshot["crew"] if member["role"] == "crew")
    assert departed["leftAt"] == _BASE_TIME.isoformat()
    assert departed["leftNote"] == "Evacuated"


def test_a_departure_travels_to_the_phones_on_the_next_pull(client, app, trip_with_crew):
    trip = trip_with_crew["trip"]
    _set_state(app, trip["id"], TripStateType.HAPPENING)
    crew_member = _member_id(app, trip["id"])["crew"]
    _send(
        client,
        trip_with_crew["leader_headers"],
        _envelope("crew_departure", "create", crew_member, {"tripId": trip["id"], "note": "Evacuated"}),
    )

    pulled = client.get(
        f"{MOBILE_SYNC_ENDPOINT}/trip/{trip['id']}/pull", headers=trip_with_crew["crew_headers"]
    ).json["changes"]["trip_members"]["created"]

    row = next(member for member in pulled if member["id"] == crew_member)
    assert row["leftAt"] == int(_BASE_TIME.timestamp() * 1000)
    assert row["leftNote"] == "Evacuated"
