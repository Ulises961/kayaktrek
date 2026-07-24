"""M8 phase 3 (D2/D3) — POST /api/v1/live/trip/<id>/position ingest + broadcast."""
import json
from datetime import datetime, timedelta, timezone

from Resources.trip_resource import TRIP_ENDPOINT
from Resources.live_resource import LIVE_ENDPOINT
from Models.position_ping import PositionPing
import Services.live_position_service as live_position_service


def _promote_to_happening(client, headers, trip_id):
    r = client.post(f"{TRIP_ENDPOINT}/{trip_id}/state", json={"state": "happening"}, headers=headers)
    assert r.status_code == 200


def test_position_requires_auth(client, trip_with_user2_as_crew):
    trip_id = trip_with_user2_as_crew["trip"]["id"]
    r = client.post(f"{LIVE_ENDPOINT}/trip/{trip_id}/position", json={"lat": 43.0, "lon": 13.0})
    assert r.status_code in (401, 403)


def test_position_non_member_is_forbidden(client, outsider_headers, trip_with_user2_as_crew):
    trip_id = trip_with_user2_as_crew["trip"]["id"]
    r = client.post(
        f"{LIVE_ENDPOINT}/trip/{trip_id}/position",
        json={"lat": 43.0, "lon": 13.0},
        headers=outsider_headers,
    )
    assert r.status_code == 403


def test_position_while_building_is_409(client, trip_with_user2_as_crew, monkeypatch):
    trip = trip_with_user2_as_crew["trip"]
    monkeypatch.setattr(live_position_service, "live_redis", lambda: _NoopRedis())

    r = client.post(
        f"{LIVE_ENDPOINT}/trip/{trip['id']}/position",
        json={"lat": 43.0, "lon": 13.0},
        headers=trip_with_user2_as_crew["leader_headers"],
    )
    assert r.status_code == 409
    assert "happening" in r.get_json()["message"].lower()


class _NoopRedis:
    def __init__(self):
        self.published = []

    def publish(self, channel, message):
        self.published.append((channel, message))


def test_position_while_happening_persists_and_returns_201(client, trip_with_user2_as_crew, monkeypatch):
    trip = trip_with_user2_as_crew["trip"]
    leader_headers = trip_with_user2_as_crew["leader_headers"]
    _promote_to_happening(client, leader_headers, trip["id"])

    fake_redis = _NoopRedis()
    monkeypatch.setattr(live_position_service, "live_redis", lambda: fake_redis)

    r = client.post(
        f"{LIVE_ENDPOINT}/trip/{trip['id']}/position",
        json={"lat": 43.5, "lon": 13.25, "accuracyM": 5.0, "headingDeg": 90.0, "speedMs": 1.2},
        headers=leader_headers,
    )
    assert r.status_code == 201
    body = r.get_json()
    assert body["lat"] == 43.5
    assert body["lon"] == 13.25

    pings = PositionPing.query.filter_by(trip_id=trip["id"]).all()
    assert len(pings) == 1
    assert pings[0].accuracy_m == 5.0


def test_position_publishes_camelcase_payload_to_trip_channel(client, trip_with_user2_as_crew, monkeypatch):
    trip = trip_with_user2_as_crew["trip"]
    leader_headers = trip_with_user2_as_crew["leader_headers"]
    _promote_to_happening(client, leader_headers, trip["id"])

    fake_redis = _NoopRedis()
    monkeypatch.setattr(live_position_service, "live_redis", lambda: fake_redis)

    r = client.post(
        f"{LIVE_ENDPOINT}/trip/{trip['id']}/position",
        json={"lat": 43.5, "lon": 13.25},
        headers=leader_headers,
    )
    assert r.status_code == 201
    assert len(fake_redis.published) == 1
    channel, raw_message = fake_redis.published[0]
    assert channel == f"live:trip:{trip['id']}"
    message = json.loads(raw_message)
    assert message["lat"] == 43.5
    assert message["lon"] == 13.25
    assert "userId" in message
    assert "recordedAt" in message
    assert "accuracyM" in message and "headingDeg" in message and "speedMs" in message


def test_position_future_timestamp_is_clamped_to_now(client, trip_with_user2_as_crew, monkeypatch):
    trip = trip_with_user2_as_crew["trip"]
    leader_headers = trip_with_user2_as_crew["leader_headers"]
    _promote_to_happening(client, leader_headers, trip["id"])
    monkeypatch.setattr(live_position_service, "live_redis", lambda: _NoopRedis())

    future = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
    r = client.post(
        f"{LIVE_ENDPOINT}/trip/{trip['id']}/position",
        json={"lat": 43.5, "lon": 13.25, "recordedAt": future},
        headers=leader_headers,
    )
    assert r.status_code == 201

    ping = PositionPing.query.filter_by(trip_id=trip["id"]).one()
    assert ping.recorded_at <= datetime.now(timezone.utc)


def test_latest_positions_returns_one_row_per_member(client, trip_with_user2_as_crew, monkeypatch):
    trip = trip_with_user2_as_crew["trip"]
    leader_headers = trip_with_user2_as_crew["leader_headers"]
    crew_headers = trip_with_user2_as_crew["crew_headers"]
    _promote_to_happening(client, leader_headers, trip["id"])
    monkeypatch.setattr(live_position_service, "live_redis", lambda: _NoopRedis())

    for lat in (43.0, 43.1, 43.2):
        r = client.post(
            f"{LIVE_ENDPOINT}/trip/{trip['id']}/position",
            json={"lat": lat, "lon": 13.0},
            headers=leader_headers,
        )
        assert r.status_code == 201

    r = client.post(
        f"{LIVE_ENDPOINT}/trip/{trip['id']}/position",
        json={"lat": 44.0, "lon": 14.0},
        headers=crew_headers,
    )
    assert r.status_code == 201

    from Services.live_position_service import LivePositionService

    latest = LivePositionService.latest_positions(trip["id"])
    assert len(latest) == 2
    by_user = {str(p.user_id): p for p in latest}
    assert by_user[trip_with_user2_as_crew["crew_id"]].lat == 44.0
    leader_ping = next(p for uid, p in by_user.items() if uid != trip_with_user2_as_crew["crew_id"])
    assert leader_ping.lat == 43.2
