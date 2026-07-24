"""M8 phase 4 (D4/D5) — LiveStreamService generator + stream tickets."""
import json

import jwt
import pytest

from Resources.trip_resource import TRIP_ENDPOINT
from Resources.itinerary_resource import ITINERARY_ENDPOINT
from Resources.live_resource import LIVE_ENDPOINT
from Services.Middleware.auth_middleware import JWTService
from Services.trip_service import TripService
import Services.live_position_service as live_position_service
import Services.live_stream_service as live_stream_service
import Resources.live_resource as live_resource
from Services.live_stream_service import LiveStreamService, STREAM_TICKET_PURPOSE


class _NoopRedis:
    def publish(self, channel, message):
        pass


class _FakePubSub:
    """Scripted fake — each call to get_message() pops the next entry."""

    def __init__(self, messages):
        self._messages = list(messages)
        self.unsubscribed = False
        self.closed = False

    def get_message(self, timeout=None):
        if self._messages:
            return self._messages.pop(0)
        return None

    def subscribe(self, channel):
        pass

    def unsubscribe(self, channel):
        self.unsubscribed = True

    def close(self):
        self.closed = True


def _promote_to_happening(client, headers, trip_id):
    r = client.post(f"{TRIP_ENDPOINT}/{trip_id}/state", json={"state": "happening"}, headers=headers)
    assert r.status_code == 200


def _record_ping(client, headers, trip_id, lat, lon):
    r = client.post(
        f"/api/v1/live/trip/{trip_id}/position",
        json={"lat": lat, "lon": lon},
        headers=headers,
    )
    assert r.status_code == 201


def test_stream_events_snapshot_before_relay(app, client, trip_with_user2_as_crew, monkeypatch):
    trip = trip_with_user2_as_crew["trip"]
    leader_headers = trip_with_user2_as_crew["leader_headers"]
    _promote_to_happening(client, leader_headers, trip["id"])
    monkeypatch.setattr(live_position_service, "live_redis", lambda: _NoopRedis())
    _record_ping(client, leader_headers, trip["id"], 43.0, 13.0)

    # A fresh nested app context isolates the generator's own db.session.remove()
    # ticks (D1/D4 pool-exhaustion guard) from the session-scoped fixtures (user_1/
    # user_2) other tests in this worker still hold references to.
    with app.app_context():
        fake_pubsub = _FakePubSub([None, None])
        events = list(LiveStreamService.stream_events(trip["id"], pubsub=fake_pubsub, max_ticks=2))

    assert events[0] == "retry: 5000\n\n"
    assert events[1].startswith("event: snapshot\ndata: ")
    snapshot = json.loads(events[1].split("data: ", 1)[1])
    assert len(snapshot) == 1
    assert snapshot[0]["lat"] == 43.0
    # Relay/heartbeat ticks come strictly after the snapshot.
    assert events[2] == ": hb\n\n"
    assert events[3] == ": hb\n\n"


def test_stream_events_relays_position_message(app, client, trip_with_user2_as_crew, monkeypatch):
    trip = trip_with_user2_as_crew["trip"]
    leader_headers = trip_with_user2_as_crew["leader_headers"]
    _promote_to_happening(client, leader_headers, trip["id"])
    monkeypatch.setattr(live_position_service, "live_redis", lambda: _NoopRedis())

    raw_payload = json.dumps({"userId": "abc", "lat": 1.0, "lon": 2.0})
    with app.app_context():
        fake_pubsub = _FakePubSub([{"type": "message", "data": raw_payload}])
        events = list(LiveStreamService.stream_events(trip["id"], pubsub=fake_pubsub, max_ticks=1))

    assert events[-1] == f"event: position\ndata: {raw_payload}\n\n"


def test_stream_events_heartbeat_on_timeout(app, client, trip_with_user2_as_crew, monkeypatch):
    trip = trip_with_user2_as_crew["trip"]
    leader_headers = trip_with_user2_as_crew["leader_headers"]
    _promote_to_happening(client, leader_headers, trip["id"])
    monkeypatch.setattr(live_position_service, "live_redis", lambda: _NoopRedis())

    with app.app_context():
        fake_pubsub = _FakePubSub([None])
        events = list(LiveStreamService.stream_events(trip["id"], pubsub=fake_pubsub, max_ticks=1))

    assert events[-1] == ": hb\n\n"


def test_stream_events_ends_when_trip_flips_to_past_mid_stream(app, client, trip_with_user2_as_crew, monkeypatch):
    trip = trip_with_user2_as_crew["trip"]
    leader_headers = trip_with_user2_as_crew["leader_headers"]
    _promote_to_happening(client, leader_headers, trip["id"])
    monkeypatch.setattr(live_position_service, "live_redis", lambda: _NoopRedis())

    with app.app_context():
        fake_pubsub = _FakePubSub([None, None, None])
        gen = LiveStreamService.stream_events(trip["id"], pubsub=fake_pubsub, max_ticks=5)

        assert next(gen) == "retry: 5000\n\n"
        assert next(gen).startswith("event: snapshot")
        assert next(gen) == ": hb\n\n"  # tick 1 — still happening

        TripService.transition_trip_state(trip["id"], "past")

        assert next(gen) == "event: end\ndata: {}\n\n"  # tick 2 — no longer happening
        with pytest.raises(StopIteration):
            next(gen)

        assert fake_pubsub.unsubscribed is False  # caller-supplied pubsub is never closed by the generator


def test_stream_events_unsubscribes_and_closes_owned_pubsub(app, client, trip_with_user2_as_crew, monkeypatch):
    trip = trip_with_user2_as_crew["trip"]
    leader_headers = trip_with_user2_as_crew["leader_headers"]
    _promote_to_happening(client, leader_headers, trip["id"])

    owned_pubsub = _FakePubSub([None])

    class _FakeRedisClient:
        def pubsub(self_inner):
            return owned_pubsub

        def publish(self_inner, channel, message):
            pass

    monkeypatch.setattr(live_position_service, "live_redis", lambda: _FakeRedisClient())
    monkeypatch.setattr(live_stream_service, "live_redis", lambda: _FakeRedisClient())

    with app.app_context():
        list(LiveStreamService.stream_events(trip["id"], max_ticks=1))

    assert owned_pubsub.unsubscribed is True
    assert owned_pubsub.closed is True


def test_stream_ticket_round_trip(app, trip_with_user2_as_crew):
    trip_id = trip_with_user2_as_crew["trip"]["id"]
    with app.app_context():
        ticket = LiveStreamService.mint_stream_ticket(trip_id)
        assert LiveStreamService.verify_stream_ticket(ticket, trip_id) is True


def test_stream_ticket_wrong_trip_is_rejected(app, trip_with_user2_as_crew):
    trip_id = trip_with_user2_as_crew["trip"]["id"]
    with app.app_context():
        ticket = LiveStreamService.mint_stream_ticket(trip_id)
        assert LiveStreamService.verify_stream_ticket(ticket, "some-other-trip-id") is False


def test_expired_stream_ticket_is_rejected(app, trip_with_user2_as_crew):
    from datetime import datetime, timedelta, timezone

    trip_id = trip_with_user2_as_crew["trip"]["id"]
    with app.app_context():
        secret = app.config["JWT_SECRET_KEY"]
        expired = jwt.encode(
            {
                "purpose": STREAM_TICKET_PURPOSE,
                "tripId": trip_id,
                "iat": datetime.now(timezone.utc) - timedelta(minutes=10),
                "exp": datetime.now(timezone.utc) - timedelta(minutes=5),
            },
            secret,
            algorithm="HS256",
        )
        assert LiveStreamService.verify_stream_ticket(expired, trip_id) is False


def test_access_token_as_ticket_is_rejected(app, trip_with_user2_as_crew, user_1):
    trip_id = trip_with_user2_as_crew["trip"]["id"]
    with app.app_context():
        access_token = JWTService.generate_access_token(
            str(user_1.id), user_1.mail, user_1.admin, user_1.token_version
        )
        assert LiveStreamService.verify_stream_ticket(access_token, trip_id) is False


# =============================================================================
# HTTP routes
# =============================================================================

def _generate_story_token(client, headers, itinerary_id):
    r = client.post(f"{ITINERARY_ENDPOINT}/{itinerary_id}/story-share", headers=headers)
    assert r.status_code == 200
    return r.get_json()["storyShareToken"]


def _get_stream_ticket(client, headers, trip_id):
    r = client.post(f"{LIVE_ENDPOINT}/trip/{trip_id}/stream-ticket", headers=headers)
    assert r.status_code == 200
    return r.get_json()["ticket"]


def test_story_stream_unknown_token_is_404(client):
    r = client.get(f"{LIVE_ENDPOINT}/story/does-not-exist/stream")
    assert r.status_code == 404


def test_live_routes_set_cors_header_even_on_404(client):
    # Regression: EventSource is a genuinely cross-origin browser fetch for these
    # routes (unlike everything else in this app), and a missing CORS header on
    # an error response makes the browser report an opaque "CORS policy" failure
    # instead of a clean non-200 EventSource error — masking the real 404 signal.
    r = client.get(f"{LIVE_ENDPOINT}/story/does-not-exist/stream")
    assert r.status_code == 404
    assert r.headers.get("Access-Control-Allow-Origin") == "http://localhost:3000"


def test_story_stream_not_happening_is_404(client, trip_with_user2_as_crew):
    trip = trip_with_user2_as_crew["trip"]
    leader_headers = trip_with_user2_as_crew["leader_headers"]
    token = _generate_story_token(client, leader_headers, trip["itinerary"]["id"])

    r = client.get(f"{LIVE_ENDPOINT}/story/{token}/stream")
    assert r.status_code == 404


def test_post_stream_ticket_requires_auth(client, trip_with_user2_as_crew):
    trip_id = trip_with_user2_as_crew["trip"]["id"]
    r = client.post(f"{LIVE_ENDPOINT}/trip/{trip_id}/stream-ticket")
    assert r.status_code in (401, 403)


def test_post_stream_ticket_non_member_is_forbidden(client, outsider_headers, trip_with_user2_as_crew):
    trip_id = trip_with_user2_as_crew["trip"]["id"]
    r = client.post(f"{LIVE_ENDPOINT}/trip/{trip_id}/stream-ticket", headers=outsider_headers)
    assert r.status_code == 403


def test_post_stream_ticket_returns_a_verifiable_ticket(app, client, trip_with_user2_as_crew):
    trip = trip_with_user2_as_crew["trip"]
    ticket = _get_stream_ticket(client, trip_with_user2_as_crew["leader_headers"], trip["id"])
    with app.app_context():
        assert LiveStreamService.verify_stream_ticket(ticket, trip["id"]) is True


def test_trip_stream_bad_ticket_is_404(client, trip_with_user2_as_crew):
    trip = trip_with_user2_as_crew["trip"]
    leader_headers = trip_with_user2_as_crew["leader_headers"]
    _promote_to_happening(client, leader_headers, trip["id"])

    r = client.get(f"{LIVE_ENDPOINT}/trip/{trip['id']}/stream?ticket=not-a-real-ticket")
    assert r.status_code == 404


def test_trip_stream_garbage_header_and_no_ticket_is_404(client, trip_with_user2_as_crew):
    trip = trip_with_user2_as_crew["trip"]
    leader_headers = trip_with_user2_as_crew["leader_headers"]
    _promote_to_happening(client, leader_headers, trip["id"])

    r = client.get(
        f"{LIVE_ENDPOINT}/trip/{trip['id']}/stream",
        headers={"Authorization": "Bearer garbage"},
    )
    assert r.status_code == 404


def test_trip_stream_non_members_valid_header_is_404(client, outsider_headers, trip_with_user2_as_crew):
    trip = trip_with_user2_as_crew["trip"]
    leader_headers = trip_with_user2_as_crew["leader_headers"]
    _promote_to_happening(client, leader_headers, trip["id"])

    r = client.get(f"{LIVE_ENDPOINT}/trip/{trip['id']}/stream", headers=outsider_headers)
    assert r.status_code == 404


def test_trip_stream_valid_ticket_streams_200_with_snapshot(client, trip_with_user2_as_crew, monkeypatch):
    trip = trip_with_user2_as_crew["trip"]
    leader_headers = trip_with_user2_as_crew["leader_headers"]
    _promote_to_happening(client, leader_headers, trip["id"])
    ticket = _get_stream_ticket(client, leader_headers, trip["id"])

    def _finite_stream(trip_id, **kwargs):
        yield "retry: 5000\n\n"
        yield 'event: snapshot\ndata: []\n\n'

    monkeypatch.setattr(live_resource.LiveStreamService, "stream_events", _finite_stream)

    r = client.get(f"{LIVE_ENDPOINT}/trip/{trip['id']}/stream?ticket={ticket}")
    assert r.status_code == 200
    assert r.mimetype == "text/event-stream"
    assert "event: snapshot" in r.get_data(as_text=True)


def test_trip_stream_valid_auth_header_no_ticket_streams_200(client, trip_with_user2_as_crew, monkeypatch):
    trip = trip_with_user2_as_crew["trip"]
    leader_headers = trip_with_user2_as_crew["leader_headers"]
    _promote_to_happening(client, leader_headers, trip["id"])

    def _finite_stream(trip_id, **kwargs):
        yield "retry: 5000\n\n"

    monkeypatch.setattr(live_resource.LiveStreamService, "stream_events", _finite_stream)

    r = client.get(f"{LIVE_ENDPOINT}/trip/{trip['id']}/stream", headers=leader_headers)
    assert r.status_code == 200


def test_story_stream_happening_trip_streams_200(client, trip_with_user2_as_crew, monkeypatch):
    trip = trip_with_user2_as_crew["trip"]
    leader_headers = trip_with_user2_as_crew["leader_headers"]
    token = _generate_story_token(client, leader_headers, trip["itinerary"]["id"])
    _promote_to_happening(client, leader_headers, trip["id"])

    def _finite_stream(trip_id, **kwargs):
        yield "event: snapshot\ndata: []\n\n"

    monkeypatch.setattr(live_resource.LiveStreamService, "stream_events", _finite_stream)

    r = client.get(f"{LIVE_ENDPOINT}/story/{token}/stream")
    assert r.status_code == 200
    assert r.mimetype == "text/event-stream"
