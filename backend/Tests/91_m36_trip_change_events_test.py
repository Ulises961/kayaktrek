"""M36 WP1 — trip change notifications published after commit."""
import json
from unittest.mock import patch

from Api.database import Base, db
from Models.point import Point
from Resources.point_resource import POINT_ENDPOINT
from Resources.trip_resource import TRIP_ENDPOINT
from Services.Utils.trip_change_events import EXCLUDED_MODELS, TRIP_SCOPED_RESOLVERS
from Services.trip_change_service import trip_changes_channel


def _messages_for(fake_redis, trip_id):
    channel = trip_changes_channel(trip_id)
    return [json.loads(message) for published_channel, message in fake_redis.published if published_channel == channel]


def _changes(fake_redis, trip_id):
    return [change for message in _messages_for(fake_redis, trip_id) for change in message["changes"]]


def test_every_mapped_model_is_registered_or_explicitly_excluded():
    """A new model must be either trip-scoped (with a resolver) or excluded with a reason —
    otherwise a trip-scoped model added later would silently never notify anyone."""
    covered = set(TRIP_SCOPED_RESOLVERS) | set(EXCLUDED_MODELS)
    uncovered = sorted(mapper.class_.__name__ for mapper in Base.registry.mappers if mapper.class_ not in covered)
    assert uncovered == []
    assert set(TRIP_SCOPED_RESOLVERS) & set(EXCLUDED_MODELS) == set()


def test_excluded_models_carry_a_reason():
    assert all(reason.strip() for reason in EXCLUDED_MODELS.values())


def test_creating_a_point_notifies_its_trip(client, auth_headers, itinerary, trip_w_o_itinerary, trip_change_redis):
    trip_id = trip_w_o_itinerary["id"]
    trip_change_redis.published.clear()

    response = client.post(
        f"{POINT_ENDPOINT}/create",
        headers=auth_headers,
        json={"dayId": itinerary["days"][0]["id"], "type": "position"},
    )
    assert response.status_code == 201
    point_id = response.json["id"]

    assert {"t": "point", "id": point_id, "op": "create"} in _changes(trip_change_redis, trip_id)


def test_message_carries_identity_only_never_field_values(
    client, auth_headers, itinerary, trip_w_o_itinerary, trip_change_redis
):
    trip_id = trip_w_o_itinerary["id"]
    trip_change_redis.published.clear()

    client.post(
        f"{POINT_ENDPOINT}/create",
        headers=auth_headers,
        json={"dayId": itinerary["days"][0]["id"], "type": "position", "name": "Secret cove", "notes": "private"},
    )

    messages = _messages_for(trip_change_redis, trip_id)
    assert messages
    for message in messages:
        assert set(message) == {"rev", "changes"}
        for change in message["changes"]:
            assert set(change) == {"t", "id", "op"}
    raw = json.dumps(messages)
    assert "Secret cove" not in raw
    assert "private" not in raw


def test_deleting_a_point_notifies_with_the_deleted_id(
    client, auth_headers, itinerary, trip_w_o_itinerary, trip_change_redis
):
    trip_id = trip_w_o_itinerary["id"]
    created = client.post(
        f"{POINT_ENDPOINT}/create",
        headers=auth_headers,
        json={"dayId": itinerary["days"][0]["id"], "type": "position"},
    )
    point_id = created.json["id"]
    trip_change_redis.published.clear()

    response = client.delete(f"{POINT_ENDPOINT}/{point_id}", headers=auth_headers)
    assert response.status_code in (200, 204)

    assert {"t": "point", "id": point_id, "op": "delete"} in _changes(trip_change_redis, trip_id)


def test_one_commit_is_one_message_per_trip(client, auth_headers, itinerary, trip_w_o_itinerary, trip_change_redis):
    """Coalescing: deleting a mid-route point heals the chain (updates its predecessor)
    and deletes the point in one transaction — that must be one message, not one per row."""
    trip_id = trip_w_o_itinerary["id"]
    day_id = itinerary["days"][0]["id"]
    point_ids = []
    for _ in range(3):
        created = client.post(
            f"{POINT_ENDPOINT}/create", headers=auth_headers, json={"dayId": day_id, "type": "position"}
        )
        assert created.status_code == 201
        point_ids.append(created.json["id"])
    trip_change_redis.published.clear()

    response = client.delete(f"{POINT_ENDPOINT}/{point_ids[1]}", headers=auth_headers)
    assert response.status_code in (200, 204)

    messages = _messages_for(trip_change_redis, trip_id)
    assert len(messages) == 1
    changes = messages[0]["changes"]
    assert {"t": "point", "id": point_ids[1], "op": "delete"} in changes
    assert {"t": "point", "id": point_ids[0], "op": "update"} in changes


def test_revision_increases_per_trip(client, auth_headers, itinerary, trip_w_o_itinerary, trip_change_redis):
    trip_id = trip_w_o_itinerary["id"]
    trip_change_redis.published.clear()
    for _ in range(2):
        client.post(
            f"{POINT_ENDPOINT}/create",
            headers=auth_headers,
            json={"dayId": itinerary["days"][0]["id"], "type": "position"},
        )

    revisions = [message["rev"] for message in _messages_for(trip_change_redis, trip_id)]
    assert revisions == sorted(revisions)
    assert len(set(revisions)) == len(revisions)


def test_rolled_back_write_notifies_no_one(app, itinerary, trip_w_o_itinerary, trip_change_redis):
    trip_id = trip_w_o_itinerary["id"]
    trip_change_redis.published.clear()

    db.session.add(Point(day_id=itinerary["days"][0]["id"], type="position"))
    db.session.flush()
    db.session.rollback()

    assert _changes(trip_change_redis, trip_id) == []


def test_publish_failure_never_fails_the_write(client, auth_headers, itinerary):
    class _BrokenRedis:
        def incr(self, key):
            raise ConnectionError("redis unreachable")

        def publish(self, channel, message):
            raise ConnectionError("redis unreachable")

    with patch("Services.trip_change_service.live_redis", return_value=_BrokenRedis()):
        response = client.post(
            f"{POINT_ENDPOINT}/create",
            headers=auth_headers,
            json={"dayId": itinerary["days"][0]["id"], "type": "position"},
        )

    assert response.status_code == 201
    assert db.session.get(Point, response.json["id"]) is not None


def test_viewing_a_trip_notifies_no_one(client, auth_headers, trip_w_o_itinerary, trip_change_redis):
    """GET /trip/<id> bumps Trip.last_accessed_at for the weather attention gate. Published as
    a change, every viewer's refresh would re-read the trip, bump it again and publish again:
    a loop that never lets a page settle, and that every other viewer joins."""
    trip_id = trip_w_o_itinerary["id"]
    trip_change_redis.published.clear()

    response = client.get(f"{TRIP_ENDPOINT}/{trip_id}", headers=auth_headers)

    assert response.status_code == 200
    assert _changes(trip_change_redis, trip_id) == []


def test_editing_a_trip_still_notifies_its_crew(client, auth_headers, trip_w_o_itinerary, trip_change_redis):
    trip_id = trip_w_o_itinerary["id"]
    trip_change_redis.published.clear()

    response = client.patch(f"{TRIP_ENDPOINT}/{trip_id}", headers=auth_headers, json={"destination": "Somewhere new"})

    assert response.status_code == 200
    assert {"t": "trip", "id": trip_id, "op": "update"} in _changes(trip_change_redis, trip_id)
