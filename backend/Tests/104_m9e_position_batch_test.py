"""M9e WP5 — POST /live/trip/<id>/positions: a batch of buffered pings uploaded after a stretch offline."""
import json
from datetime import datetime, timedelta, timezone

import pytest

import Services.live_position_service as live_position_service
from Models.position_ping import PositionPing
from Resources.live_resource import LIVE_ENDPOINT
from Resources.trip_resource import TRIP_ENDPOINT


class _RecordingRedis:
    def __init__(self):
        self.published = []

    def publish(self, channel, message):
        self.published.append((channel, json.loads(message)))


@pytest.fixture
def redis_spy(monkeypatch):
    spy = _RecordingRedis()
    monkeypatch.setattr(live_position_service, "live_redis", lambda: spy)
    return spy


def _batch_url(trip_id):
    return f"{LIVE_ENDPOINT}/trip/{trip_id}/positions"


def _set_state(client, headers, trip_id, state):
    response = client.post(f"{TRIP_ENDPOINT}/{trip_id}/state", json={"state": state}, headers=headers)
    assert response.status_code == 200


def _ping(minutes_ago, lat=43.0, lon=13.0):
    recorded_at = datetime.now(timezone.utc) - timedelta(minutes=minutes_ago)
    return {"lat": lat, "lon": lon, "recordedAt": recorded_at.isoformat()}


def _stored(trip_id, user_id=None):
    query = PositionPing.query.filter_by(trip_id=trip_id)
    if user_id is not None:
        query = query.filter_by(user_id=user_id)
    return query.order_by(PositionPing.recorded_at).all()


@pytest.fixture
def happening_trip(client, trip_with_user2_as_crew):
    _set_state(client, trip_with_user2_as_crew["leader_headers"], trip_with_user2_as_crew["trip"]["id"], "happening")
    return trip_with_user2_as_crew


def test_batch_requires_auth(client, happening_trip):
    response = client.post(_batch_url(happening_trip["trip"]["id"]), json={"pings": [_ping(5)]})
    assert response.status_code in (401, 403)


def test_batch_from_a_non_member_is_forbidden_and_stores_nothing(client, outsider_headers, happening_trip, redis_spy):
    trip_id = happening_trip["trip"]["id"]
    response = client.post(_batch_url(trip_id), json={"pings": [_ping(5)]}, headers=outsider_headers)
    assert response.status_code == 403
    assert _stored(trip_id) == []
    assert redis_spy.published == []


def test_batch_on_a_trip_that_is_not_happening_is_409_and_stores_nothing(
    client, trip_with_user2_as_crew, redis_spy
):
    trip_id = trip_with_user2_as_crew["trip"]["id"]
    response = client.post(
        _batch_url(trip_id), json={"pings": [_ping(5)]}, headers=trip_with_user2_as_crew["leader_headers"]
    )
    assert response.status_code == 409
    assert "happening" in response.get_json()["message"].lower()
    assert _stored(trip_id) == []


def test_batch_stores_every_ping_for_the_caller_with_its_own_time(client, happening_trip, redis_spy):
    trip_id = happening_trip["trip"]["id"]
    headers = happening_trip["leader_headers"]
    pings = [_ping(180, lat=43.0), _ping(170, lat=43.1), _ping(160, lat=43.2)]

    response = client.post(_batch_url(trip_id), json={"pings": pings}, headers=headers)

    assert response.status_code == 201
    assert response.get_json() == {"accepted": 3, "duplicates": 0}
    stored = _stored(trip_id)
    assert [ping.lat for ping in stored] == [43.0, 43.1, 43.2]
    assert len({ping.user_id for ping in stored}) == 1
    sent_times = [datetime.fromisoformat(ping["recordedAt"]) for ping in pings]
    assert [ping.recorded_at for ping in stored] == sent_times


def test_batch_in_any_order_is_stored_by_recorded_time(client, happening_trip, redis_spy):
    trip_id = happening_trip["trip"]["id"]
    pings = [_ping(160, lat=43.2), _ping(180, lat=43.0), _ping(170, lat=43.1)]
    client.post(_batch_url(trip_id), json={"pings": pings}, headers=happening_trip["leader_headers"])
    assert [ping.lat for ping in _stored(trip_id)] == [43.0, 43.1, 43.2]


def test_resending_a_batch_stores_nothing_twice(client, happening_trip, redis_spy):
    trip_id = happening_trip["trip"]["id"]
    headers = happening_trip["leader_headers"]
    pings = [_ping(180), _ping(170), _ping(160)]

    first = client.post(_batch_url(trip_id), json={"pings": pings}, headers=headers)
    second = client.post(_batch_url(trip_id), json={"pings": pings}, headers=headers)

    assert first.get_json() == {"accepted": 3, "duplicates": 0}
    assert second.status_code == 201
    assert second.get_json() == {"accepted": 0, "duplicates": 3}
    assert len(_stored(trip_id)) == 3


def test_a_resend_with_new_pings_stores_only_the_new_ones(client, happening_trip, redis_spy):
    trip_id = happening_trip["trip"]["id"]
    headers = happening_trip["leader_headers"]
    already_sent = [_ping(180), _ping(170)]
    client.post(_batch_url(trip_id), json={"pings": already_sent}, headers=headers)

    response = client.post(_batch_url(trip_id), json={"pings": [*already_sent, _ping(160)]}, headers=headers)

    assert response.get_json() == {"accepted": 1, "duplicates": 2}
    assert len(_stored(trip_id)) == 3


def test_the_same_instant_from_two_members_is_two_pings(client, happening_trip, redis_spy):
    trip_id = happening_trip["trip"]["id"]
    shared_ping = _ping(180)
    client.post(_batch_url(trip_id), json={"pings": [shared_ping]}, headers=happening_trip["leader_headers"])
    response = client.post(_batch_url(trip_id), json={"pings": [shared_ping]}, headers=happening_trip["crew_headers"])

    assert response.get_json() == {"accepted": 1, "duplicates": 0}
    assert len(_stored(trip_id)) == 2


def test_a_time_in_the_future_is_clamped_to_now(client, happening_trip, redis_spy):
    trip_id = happening_trip["trip"]["id"]
    future = (datetime.now(timezone.utc) + timedelta(hours=3)).isoformat()
    client.post(
        _batch_url(trip_id),
        json={"pings": [{"lat": 43.0, "lon": 13.0, "recordedAt": future}]},
        headers=happening_trip["leader_headers"],
    )
    assert _stored(trip_id)[0].recorded_at <= datetime.now(timezone.utc)


def test_a_backlog_is_never_published_to_the_live_map(client, happening_trip, redis_spy):
    trip_id = happening_trip["trip"]["id"]
    client.post(
        _batch_url(trip_id),
        json={"pings": [_ping(180), _ping(170), _ping(160)]},
        headers=happening_trip["leader_headers"],
    )
    assert len(_stored(trip_id)) == 3
    assert redis_spy.published == []


def test_only_the_newest_ping_of_a_recent_batch_is_published(client, happening_trip, redis_spy):
    trip_id = happening_trip["trip"]["id"]
    client.post(
        _batch_url(trip_id),
        json={"pings": [_ping(40, lat=43.0), _ping(1, lat=43.9), _ping(20, lat=43.5)]},
        headers=happening_trip["leader_headers"],
    )
    assert len(_stored(trip_id)) == 3
    assert len(redis_spy.published) == 1
    assert redis_spy.published[0][1]["lat"] == 43.9


def test_a_batch_older_than_what_the_map_already_shows_is_not_published(client, happening_trip, redis_spy):
    trip_id = happening_trip["trip"]["id"]
    headers = happening_trip["leader_headers"]
    client.post(
        f"{LIVE_ENDPOINT}/trip/{trip_id}/position",
        json={"lat": 44.0, "lon": 13.0, "recordedAt": datetime.now(timezone.utc).isoformat()},
        headers=headers,
    )
    redis_spy.published.clear()

    client.post(_batch_url(trip_id), json={"pings": [_ping(2, lat=43.0)]}, headers=headers)

    assert len(_stored(trip_id)) == 2
    assert redis_spy.published == []


@pytest.mark.parametrize(
    "body",
    [
        {},
        {"pings": []},
        {"pings": [{"lat": 43.0}]},
        {"pings": [{"lat": 91.0, "lon": 13.0}]},
        {"pings": [_ping(5)] * 101},
    ],
    ids=["no-pings-key", "empty", "missing-lon", "lat-out-of-range", "over-100"],
)
def test_an_invalid_batch_is_rejected_whole(client, happening_trip, redis_spy, body):
    trip_id = happening_trip["trip"]["id"]
    response = client.post(_batch_url(trip_id), json=body, headers=happening_trip["leader_headers"])
    assert response.status_code == 422
    assert _stored(trip_id) == []


def test_a_batch_accepts_the_same_optional_fields_as_one_ping(client, happening_trip, redis_spy):
    trip_id = happening_trip["trip"]["id"]
    ping = {**_ping(5), "accuracyM": 4.0, "headingDeg": 90.0, "speedMs": 1.5}
    client.post(_batch_url(trip_id), json={"pings": [ping]}, headers=happening_trip["leader_headers"])
    stored = _stored(trip_id)[0]
    assert (stored.accuracy_m, stored.heading_deg, stored.speed_ms) == (4.0, 90.0, 1.5)
