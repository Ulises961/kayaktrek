"""M9e WP2 — GET /live/trip/<id>/positions: the crew's newest positions, polled."""
import json
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest

import Services.live_position_service as live_position_service
from Resources.live_resource import LIVE_ENDPOINT
from Resources.trip_resource import TRIP_ENDPOINT
from Services import live_stream_service
from Services.live_stream_service import LiveStreamService

WIRE_KEYS = {"userId", "name", "lat", "lon", "accuracyM", "headingDeg", "speedMs", "recordedAt"}


class _NoopRedis:
    def publish(self, channel, message):
        pass


@pytest.fixture(autouse=True)
def _isolate_live_state(monkeypatch):
    monkeypatch.setattr(live_position_service, "live_redis", lambda: _NoopRedis())
    live_stream_service._confirmed_members.clear()
    yield
    live_stream_service._confirmed_members.clear()


def _positions_url(trip_id, *, ticket=None):
    return f"{LIVE_ENDPOINT}/trip/{trip_id}/positions" + (f"?ticket={ticket}" if ticket is not None else "")


def _ticket_for(app, trip_id, user_id):
    with app.app_context():
        return LiveStreamService.mint_changes_ticket(trip_id, user_id)


def _set_state(client, headers, trip_id, state):
    response = client.post(f"{TRIP_ENDPOINT}/{trip_id}/state", json={"state": state}, headers=headers)
    assert response.status_code == 200


def _ping(client, headers, trip_id, lat, lon, *, minutes_ago=0):
    recorded_at = datetime.now(timezone.utc) - timedelta(minutes=minutes_ago)
    response = client.post(
        f"{LIVE_ENDPOINT}/trip/{trip_id}/position",
        json={"lat": lat, "lon": lon, "recordedAt": recorded_at.isoformat()},
        headers=headers,
    )
    assert response.status_code == 201


@pytest.fixture
def happening_trip(client, trip_with_user2_as_crew):
    _set_state(client, trip_with_user2_as_crew["leader_headers"], trip_with_user2_as_crew["trip"]["id"], "happening")
    return trip_with_user2_as_crew


def test_without_credentials_the_answer_is_404(client, happening_trip):
    assert client.get(_positions_url(happening_trip["trip"]["id"])).status_code == 404


def test_a_bad_ticket_is_404(client, happening_trip):
    response = client.get(_positions_url(happening_trip["trip"]["id"], ticket="not-a-ticket"))
    assert response.status_code == 404


def test_a_non_member_with_a_valid_header_is_404_and_learns_nothing(client, outsider_headers, happening_trip):
    trip_id = happening_trip["trip"]["id"]
    _ping(client, happening_trip["leader_headers"], trip_id, 43.0, 13.0)

    response = client.get(_positions_url(trip_id), headers=outsider_headers)

    assert response.status_code == 404
    assert response.data == b""


def test_a_ticket_for_a_non_member_is_404(app, client, happening_trip):
    trip_id = happening_trip["trip"]["id"]
    ticket = _ticket_for(app, trip_id, str(uuid4()))
    assert client.get(_positions_url(trip_id, ticket=ticket)).status_code == 404


def test_the_stream_ticket_does_not_open_the_poll(app, client, happening_trip):
    trip_id = happening_trip["trip"]["id"]
    with app.app_context():
        stream_ticket = LiveStreamService.mint_stream_ticket(trip_id)
    assert client.get(_positions_url(trip_id, ticket=stream_ticket)).status_code == 404


def test_a_malformed_trip_id_is_404_not_an_error(app, client):
    ticket = _ticket_for(app, "not-a-uuid", str(uuid4()))
    assert client.get(_positions_url("not-a-uuid", ticket=ticket)).status_code == 404


@pytest.mark.parametrize("state", ["building", "past"])
def test_a_trip_that_is_not_happening_is_404_for_its_own_leader(client, trip_with_user2_as_crew, state):
    trip_id = trip_with_user2_as_crew["trip"]["id"]
    leader_headers = trip_with_user2_as_crew["leader_headers"]
    if state == "past":
        _set_state(client, leader_headers, trip_id, "happening")
        _ping(client, leader_headers, trip_id, 43.0, 13.0)
        _set_state(client, leader_headers, trip_id, "past")

    assert client.get(_positions_url(trip_id), headers=leader_headers).status_code == 404


def test_a_happening_trip_with_no_pings_answers_an_empty_list(client, happening_trip):
    response = client.get(_positions_url(happening_trip["trip"]["id"]), headers=happening_trip["leader_headers"])

    assert response.status_code == 200
    assert response.json == {"positions": []}


def test_the_newest_ping_of_each_member_is_returned_in_the_stream_wire_shape(app, client, happening_trip):
    trip_id = happening_trip["trip"]["id"]
    leader_headers, crew_headers = happening_trip["leader_headers"], happening_trip["crew_headers"]
    _ping(client, leader_headers, trip_id, 43.00, 13.00, minutes_ago=30)
    _ping(client, leader_headers, trip_id, 43.10, 13.10, minutes_ago=1)
    _ping(client, crew_headers, trip_id, 44.00, 14.00, minutes_ago=5)
    ticket = _ticket_for(app, trip_id, happening_trip["crew_id"])

    response = client.get(_positions_url(trip_id, ticket=ticket))

    assert response.status_code == 200
    positions = response.json["positions"]
    assert len(positions) == 2
    assert all(set(entry) == WIRE_KEYS for entry in positions)
    by_user = {entry["userId"]: entry for entry in positions}
    assert (by_user[happening_trip["crew_id"]]["lat"], by_user[happening_trip["crew_id"]]["lon"]) == (44.00, 14.00)
    leader_entry = next(entry for entry in positions if entry["userId"] != happening_trip["crew_id"])
    assert (leader_entry["lat"], leader_entry["lon"]) == (43.10, 13.10)


def test_a_member_who_never_shared_is_absent(client, happening_trip):
    trip_id = happening_trip["trip"]["id"]
    _ping(client, happening_trip["leader_headers"], trip_id, 43.0, 13.0)

    response = client.get(_positions_url(trip_id), headers=happening_trip["crew_headers"])

    answered_users = [entry["userId"] for entry in response.json["positions"]]
    assert len(answered_users) == 1
    assert happening_trip["crew_id"] not in answered_users


def test_the_poll_and_the_stream_snapshot_are_the_same_list(app, client, happening_trip):
    trip_id = happening_trip["trip"]["id"]
    _ping(client, happening_trip["leader_headers"], trip_id, 43.0, 13.0)
    _ping(client, happening_trip["crew_headers"], trip_id, 44.0, 14.0)

    polled = client.get(_positions_url(trip_id), headers=happening_trip["leader_headers"]).json["positions"]
    with app.app_context():
        events = list(LiveStreamService.stream_events(trip_id, pubsub=_EmptyPubSub(), max_ticks=0))
    streamed = json.loads(events[1].split("data: ", 1)[1])

    assert sorted(polled, key=lambda entry: entry["userId"]) == sorted(streamed, key=lambda entry: entry["userId"])


class _EmptyPubSub:
    def get_message(self, timeout=None):
        return None

    def subscribe(self, channel):
        pass

    def unsubscribe(self, channel):
        pass

    def close(self):
        pass


def test_the_answer_is_never_cached(client, happening_trip):
    response = client.get(_positions_url(happening_trip["trip"]["id"]), headers=happening_trip["leader_headers"])
    assert response.headers["Cache-Control"] == "no-store"


def test_a_paused_trip_still_answers(client, happening_trip):
    trip_id = happening_trip["trip"]["id"]
    leader_headers = happening_trip["leader_headers"]
    _ping(client, leader_headers, trip_id, 43.0, 13.0)
    paused = client.post(f"{TRIP_ENDPOINT}/{trip_id}/pause", headers=leader_headers)
    assert paused.status_code == 200

    response = client.get(_positions_url(trip_id), headers=leader_headers)

    assert response.status_code == 200
    assert len(response.json["positions"]) == 1
