"""M36 WP2 — trip-changes stream: tickets, generator, endpoint authorisation."""
import json
from uuid import uuid4

from Resources.live_resource import LIVE_ENDPOINT
from Services.live_stream_service import LiveStreamService
from Services.trip_change_service import trip_changes_channel, trip_revision_key
from Services.Utils.pubsub_fanout import SubscriptionClosed


class _FakePubSub:
    """Scripted fake — each call to get_message() pops the next entry."""

    def __init__(self, messages):
        self._messages = list(messages)
        self.subscribed_to = []
        self.unsubscribed = False
        self.closed = False

    def get_message(self, timeout=None):
        return self._messages.pop(0) if self._messages else None

    def subscribe(self, channel):
        self.subscribed_to.append(channel)

    def unsubscribe(self, channel):
        self.unsubscribed = True

    def close(self):
        self.closed = True


class _FakeRedis:
    def __init__(self, revisions=None, pubsub=None):
        self._revisions = revisions or {}
        self._pubsub = pubsub

    def get(self, key):
        return self._revisions.get(key)

    def pubsub(self):
        return self._pubsub


def _stream(app, trip_id, user_id, messages, **kwargs):
    with app.app_context():
        pubsub = _FakePubSub(messages)
        events = list(
            LiveStreamService.stream_trip_changes(
                trip_id, user_id, pubsub=pubsub, redis_client=_FakeRedis({trip_revision_key(trip_id): "41"}), **kwargs
            )
        )
    return events, pubsub


def test_changes_ticket_round_trips_with_its_user(app, trip_with_user2_as_crew):
    trip_id = trip_with_user2_as_crew["trip"]["id"]
    with app.app_context():
        ticket = LiveStreamService.mint_changes_ticket(trip_id, "user-123")
        assert LiveStreamService.verify_changes_ticket(ticket, trip_id) == "user-123"


def test_changes_ticket_for_another_trip_is_rejected(app, trip_with_user2_as_crew):
    trip_id = trip_with_user2_as_crew["trip"]["id"]
    with app.app_context():
        ticket = LiveStreamService.mint_changes_ticket(trip_id, "user-123")
        assert LiveStreamService.verify_changes_ticket(ticket, str(uuid4())) is None


def test_position_ticket_does_not_open_the_changes_stream_and_vice_versa(app, trip_with_user2_as_crew):
    trip_id = trip_with_user2_as_crew["trip"]["id"]
    with app.app_context():
        position_ticket = LiveStreamService.mint_stream_ticket(trip_id)
        changes_ticket = LiveStreamService.mint_changes_ticket(trip_id, "user-123")
        assert LiveStreamService.verify_changes_ticket(position_ticket, trip_id) is None
        assert LiveStreamService.verify_stream_ticket(changes_ticket, trip_id) is False


def test_stream_sends_hello_with_current_revision_then_relays_changes(app, trip_with_user2_as_crew):
    trip_id = trip_with_user2_as_crew["trip"]["id"]
    payload = json.dumps({"rev": 42, "changes": [{"t": "point", "id": "p1", "op": "update"}]})

    events, _ = _stream(
        app, trip_id, trip_with_user2_as_crew["crew_id"], [{"type": "message", "data": payload}], max_ticks=1
    )

    assert events[0] == "retry: 5000\n\n"
    assert events[1] == 'event: hello\ndata: {"rev": 41}\n\n'
    assert events[2] == f"event: change\ndata: {payload}\n\n"


class _FakeSubscription:
    """What PubSubFanout.subscribe returns: the same get_message a PubSub has, plus close."""

    def __init__(self, messages):
        self._messages = list(messages)
        self.closed = False

    def get_message(self, timeout=None):
        if not self._messages:
            return None
        message = self._messages.pop(0)
        if isinstance(message, Exception):
            raise message
        return message

    def close(self):
        self.closed = True


class _FakeFanout:
    def __init__(self, subscription):
        self.subscription = subscription
        self.channels = []

    def subscribe(self, channel):
        self.channels.append(channel)
        return self.subscription


def test_stream_takes_its_subscription_from_the_shared_fanout_and_gives_it_back(app, trip_with_user2_as_crew):
    """No `pubsub()` per viewer: that is one Redis connection each, held for as long as
    the viewer stays, which is what capped the sidecar."""
    trip_id = trip_with_user2_as_crew["trip"]["id"]
    fanout = _FakeFanout(_FakeSubscription([]))
    with app.app_context():
        list(
            LiveStreamService.stream_trip_changes(
                trip_id,
                trip_with_user2_as_crew["crew_id"],
                fanout=fanout,
                redis_client=_FakeRedis(),
                max_ticks=0,
            )
        )

    assert fanout.channels == [trip_changes_channel(trip_id)]
    assert fanout.subscription.closed is True


def test_stream_ends_without_an_end_event_when_the_viewer_is_cut_loose(app, trip_with_user2_as_crew):
    """`end` means membership was lost and the client must not reconnect. A viewer cut
    loose for not reading should reconnect — the new `hello` tells it to refetch."""
    trip_id = trip_with_user2_as_crew["trip"]["id"]
    fanout = _FakeFanout(_FakeSubscription([SubscriptionClosed()]))
    with app.app_context():
        events = list(
            LiveStreamService.stream_trip_changes(
                trip_id,
                trip_with_user2_as_crew["crew_id"],
                fanout=fanout,
                redis_client=_FakeRedis(),
                max_ticks=5,
            )
        )

    assert "event: end\ndata: {}\n\n" not in events
    assert events[-1].startswith("event: hello")
    assert fanout.subscription.closed is True


def test_changes_stream_is_refused_with_a_retry_after_when_the_sidecar_is_full(
    client, trip_with_user2_as_crew, monkeypatch
):
    """A clean 503 the client backs off from, rather than a connection the worker can no
    longer accept and that hangs until it times out."""
    monkeypatch.setattr(LiveStreamService, "changes_streams_at_capacity", staticmethod(lambda: True))

    response = client.get(
        f"{LIVE_ENDPOINT}/trip/{trip_with_user2_as_crew['trip']['id']}/changes",
        headers=trip_with_user2_as_crew["crew_headers"],
    )

    assert response.status_code == 503
    assert int(response.headers["Retry-After"]) > 0


def test_a_non_member_is_told_404_not_503_even_when_the_sidecar_is_full(
    client, outsider_headers, trip_with_user2_as_crew, monkeypatch
):
    """Capacity must not become a way to learn which trips exist."""
    monkeypatch.setattr(LiveStreamService, "changes_streams_at_capacity", staticmethod(lambda: True))

    response = client.get(
        f"{LIVE_ENDPOINT}/trip/{trip_with_user2_as_crew['trip']['id']}/changes", headers=outsider_headers
    )

    assert response.status_code == 404


def test_capacity_is_reached_at_the_configured_number_of_streams(app, monkeypatch):
    class _Fanout:
        def __init__(self, count):
            self._count = count

        def active_subscriptions(self):
            return self._count

    monkeypatch.setenv("TRIP_CHANGES_MAX_STREAMS", "3")
    with app.app_context():
        monkeypatch.setattr("Services.live_stream_service.trip_changes_fanout", lambda: _Fanout(2))
        assert LiveStreamService.changes_streams_at_capacity() is False
        monkeypatch.setattr("Services.live_stream_service.trip_changes_fanout", lambda: _Fanout(3))
        assert LiveStreamService.changes_streams_at_capacity() is True


def test_stream_with_no_revision_yet_says_zero(app, trip_with_user2_as_crew):
    trip_id = trip_with_user2_as_crew["trip"]["id"]
    with app.app_context():
        events = list(
            LiveStreamService.stream_trip_changes(
                trip_id,
                trip_with_user2_as_crew["crew_id"],
                pubsub=_FakePubSub([]),
                redis_client=_FakeRedis(),
                max_ticks=0,
            )
        )
    assert events[1] == 'event: hello\ndata: {"rev": 0}\n\n'


def test_heartbeat_on_timeout(app, trip_with_user2_as_crew):
    events, _ = _stream(
        app, trip_with_user2_as_crew["trip"]["id"], trip_with_user2_as_crew["crew_id"], [None], max_ticks=1
    )
    assert events[-1] == ": hb\n\n"


def test_stream_stays_open_while_the_trip_is_building(app, trip_with_user2_as_crew):
    """Unlike the position stream, collaboration happens before `happening`."""
    trip_id = trip_with_user2_as_crew["trip"]["id"]

    events, _ = _stream(app, trip_id, trip_with_user2_as_crew["crew_id"], [None, None], max_ticks=2)

    assert "event: end\ndata: {}\n\n" not in events


def test_stream_stays_open_for_a_current_member_across_the_membership_check(app, trip_with_user2_as_crew):
    clock = iter([0, 100, 100, 200, 200, 300])
    events, _ = _stream(
        app,
        trip_with_user2_as_crew["trip"]["id"],
        trip_with_user2_as_crew["crew_id"],
        [None, None],
        max_ticks=2,
        membership_check_seconds=60,
        monotonic=lambda: next(clock),
    )
    assert "event: end\ndata: {}\n\n" not in events


def test_stream_ends_when_membership_is_lost(app, trip_with_user2_as_crew):
    """A user who is not (or no longer) a member must not stay subscribed for the life
    of the connection."""
    clock = iter([0, 100, 100, 200])
    events, pubsub = _stream(
        app,
        trip_with_user2_as_crew["trip"]["id"],
        str(uuid4()),
        [None, None],
        max_ticks=5,
        membership_check_seconds=60,
        monotonic=lambda: next(clock),
    )

    assert events[-1] == "event: end\ndata: {}\n\n"
    assert pubsub.unsubscribed is False  # injected pubsub is the caller's to close


def test_post_changes_ticket_requires_auth(client, trip_with_user2_as_crew):
    response = client.post(f"{LIVE_ENDPOINT}/trip/{trip_with_user2_as_crew['trip']['id']}/changes-ticket")
    assert response.status_code in (401, 403)


def test_post_changes_ticket_non_member_is_forbidden(client, outsider_headers, trip_with_user2_as_crew):
    response = client.post(
        f"{LIVE_ENDPOINT}/trip/{trip_with_user2_as_crew['trip']['id']}/changes-ticket", headers=outsider_headers
    )
    assert response.status_code == 403


def test_post_changes_ticket_returns_a_ticket_naming_the_caller(app, client, trip_with_user2_as_crew):
    trip_id = trip_with_user2_as_crew["trip"]["id"]
    response = client.post(
        f"{LIVE_ENDPOINT}/trip/{trip_id}/changes-ticket", headers=trip_with_user2_as_crew["crew_headers"]
    )
    assert response.status_code == 200
    with app.app_context():
        assert LiveStreamService.verify_changes_ticket(response.json["ticket"], trip_id) == trip_with_user2_as_crew[
            "crew_id"
        ]


def test_changes_stream_without_credentials_is_404(client, trip_with_user2_as_crew):
    response = client.get(f"{LIVE_ENDPOINT}/trip/{trip_with_user2_as_crew['trip']['id']}/changes")
    assert response.status_code == 404


def test_changes_stream_bad_ticket_is_404(client, trip_with_user2_as_crew):
    response = client.get(
        f"{LIVE_ENDPOINT}/trip/{trip_with_user2_as_crew['trip']['id']}/changes?ticket=not-a-ticket"
    )
    assert response.status_code == 404


def test_changes_stream_rejects_a_position_stream_ticket(app, client, trip_with_user2_as_crew):
    trip_id = trip_with_user2_as_crew["trip"]["id"]
    with app.app_context():
        position_ticket = LiveStreamService.mint_stream_ticket(trip_id)
    response = client.get(f"{LIVE_ENDPOINT}/trip/{trip_id}/changes?ticket={position_ticket}")
    assert response.status_code == 404


def test_changes_stream_ticket_of_a_non_member_is_404(app, client, trip_with_user2_as_crew):
    """A ticket is minted for a member, but membership is re-checked at connect: a
    member removed within the ticket's 5 minutes must not get in."""
    trip_id = trip_with_user2_as_crew["trip"]["id"]
    with app.app_context():
        ticket = LiveStreamService.mint_changes_ticket(trip_id, str(uuid4()))
    response = client.get(f"{LIVE_ENDPOINT}/trip/{trip_id}/changes?ticket={ticket}")
    assert response.status_code == 404


def test_changes_stream_non_members_valid_header_is_404(client, outsider_headers, trip_with_user2_as_crew):
    response = client.get(
        f"{LIVE_ENDPOINT}/trip/{trip_with_user2_as_crew['trip']['id']}/changes", headers=outsider_headers
    )
    assert response.status_code == 404
