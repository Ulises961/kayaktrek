"""M36 capacity — one Redis subscription per process, fanned out to local viewers."""
import queue
import time

import pytest
import redis

from Services.Utils.pubsub_fanout import PubSubFanout, SubscriptionClosed


class _FakePubSub:
    """Stands in for redis-py's PubSub: a blocking inbox plus a log of what was asked of it."""

    def __init__(self):
        self._inbox = queue.Queue()
        self.subscribed = []
        self.unsubscribed = []
        self.closed = False
        self.connection_errors_to_raise = 0
        self.closed_under_the_reader_errors_to_raise = 0

    def subscribe(self, channel):
        self.subscribed.append(channel)

    def unsubscribe(self, channel):
        self.unsubscribed.append(channel)

    def close(self):
        self.closed = True

    def get_message(self, ignore_subscribe_messages=False, timeout=0.0):
        if self.closed:
            raise RuntimeError("pubsub connection not set: did you forget to call subscribe()?")
        if self.connection_errors_to_raise:
            self.connection_errors_to_raise -= 1
            raise redis.ConnectionError("down")
        if self.closed_under_the_reader_errors_to_raise:
            # What redis-py raises when another greenlet closes the socket this one is
            # blocked reading: not a ConnectionError, and seen on the real sidecar.
            self.closed_under_the_reader_errors_to_raise -= 1
            raise ValueError("I/O operation on closed file.")
        try:
            return self._inbox.get(timeout=timeout)
        except queue.Empty:
            return None

    def publish(self, channel, data):
        self._inbox.put({"type": "message", "channel": channel, "data": data})


class _FakeRedis:
    def __init__(self):
        self.pubsubs = []

    def pubsub(self):
        pubsub = _FakePubSub()
        self.pubsubs.append(pubsub)
        return pubsub


@pytest.fixture
def redis_client():
    return _FakeRedis()


@pytest.fixture
def fanout(redis_client):
    return PubSubFanout(lambda: redis_client, poll_seconds=0.01, max_pending=4)


def _wait_for(condition, timeout=2.0):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if condition():
            return True
        time.sleep(0.005)
    return False


def test_viewers_of_one_channel_share_one_redis_subscription(fanout, redis_client):
    first = fanout.subscribe("trip:a:changes")
    second = fanout.subscribe("trip:a:changes")

    assert len(redis_client.pubsubs) == 1
    assert redis_client.pubsubs[0].subscribed == ["trip:a:changes"]
    first.close()
    second.close()


def test_many_channels_share_one_redis_connection(fanout, redis_client):
    subscriptions = [fanout.subscribe(f"trip:{n}:changes") for n in range(5)]

    assert len(redis_client.pubsubs) == 1
    assert redis_client.pubsubs[0].subscribed == [f"trip:{n}:changes" for n in range(5)]
    for subscription in subscriptions:
        subscription.close()


def test_a_message_reaches_every_viewer_of_its_channel_and_no_one_else(fanout, redis_client):
    mine_one = fanout.subscribe("trip:a:changes")
    mine_two = fanout.subscribe("trip:a:changes")
    someone_elses = fanout.subscribe("trip:b:changes")

    redis_client.pubsubs[0].publish("trip:a:changes", '{"rev": 1}')

    assert mine_one.get_message(timeout=1)["data"] == '{"rev": 1}'
    assert mine_two.get_message(timeout=1)["data"] == '{"rev": 1}'
    assert someone_elses.get_message(timeout=0.05) is None


def test_a_message_is_shaped_like_redis_pys_so_the_stream_generator_reads_it_unchanged(
    fanout, redis_client
):
    subscription = fanout.subscribe("trip:a:changes")
    redis_client.pubsubs[0].publish("trip:a:changes", "payload")

    message = subscription.get_message(timeout=1)

    assert message["type"] == "message"
    assert message["data"] == "payload"


def test_waiting_with_nothing_to_deliver_returns_none(fanout):
    subscription = fanout.subscribe("trip:a:changes")

    assert subscription.get_message(timeout=0.01) is None


def test_one_viewer_leaving_does_not_drop_the_others(fanout, redis_client):
    staying = fanout.subscribe("trip:a:changes")
    leaving = fanout.subscribe("trip:a:changes")
    leaving.close()

    redis_client.pubsubs[0].publish("trip:a:changes", "still-here")

    assert redis_client.pubsubs[0].unsubscribed == []
    assert staying.get_message(timeout=1)["data"] == "still-here"


def test_the_last_viewer_leaving_unsubscribes_the_channel(fanout, redis_client):
    subscription = fanout.subscribe("trip:a:changes")
    other = fanout.subscribe("trip:b:changes")

    subscription.close()

    assert redis_client.pubsubs[0].unsubscribed == ["trip:a:changes"]
    assert redis_client.pubsubs[0].closed is False
    other.close()


def test_the_redis_connection_is_released_when_nobody_is_left(fanout, redis_client):
    subscription = fanout.subscribe("trip:a:changes")

    subscription.close()

    assert redis_client.pubsubs[0].closed is True
    assert fanout.active_subscriptions() == 0


def test_a_later_viewer_after_everyone_left_gets_a_fresh_working_connection(fanout, redis_client):
    fanout.subscribe("trip:a:changes").close()

    again = fanout.subscribe("trip:a:changes")
    assert _wait_for(lambda: len(redis_client.pubsubs) == 2)
    redis_client.pubsubs[1].publish("trip:a:changes", "after-restart")

    assert again.get_message(timeout=1)["data"] == "after-restart"


def test_closing_twice_is_harmless(fanout):
    subscription = fanout.subscribe("trip:a:changes")
    subscription.close()
    subscription.close()

    assert fanout.active_subscriptions() == 0


def test_active_subscriptions_counts_viewers_not_channels(fanout):
    first = fanout.subscribe("trip:a:changes")
    second = fanout.subscribe("trip:a:changes")
    third = fanout.subscribe("trip:b:changes")

    assert fanout.active_subscriptions() == 3
    second.close()
    assert fanout.active_subscriptions() == 2
    first.close()
    third.close()


def test_a_viewer_that_stops_reading_is_closed_rather_than_buffered_without_limit(
    fanout, redis_client
):
    """A stalled client must not pile messages up in memory for as long as it stays
    connected. Closing it makes the stream end, the client reconnect, and `hello`'s
    revision tell it to refetch everything — the same path as any dropped connection."""
    slow = fanout.subscribe("trip:a:changes")
    healthy = fanout.subscribe("trip:a:changes")

    for n in range(6):  # max_pending is 4
        redis_client.pubsubs[0].publish("trip:a:changes", f"m{n}")
        healthy.get_message(timeout=1)

    with pytest.raises(SubscriptionClosed):
        slow.get_message(timeout=0.5)
    redis_client.pubsubs[0].publish("trip:a:changes", "after")
    assert healthy.get_message(timeout=1)["data"] == "after"


def test_the_reader_survives_a_dropped_redis_connection(fanout, redis_client):
    subscription = fanout.subscribe("trip:a:changes")
    pubsub = redis_client.pubsubs[0]
    pubsub.connection_errors_to_raise = 2

    assert _wait_for(lambda: pubsub.connection_errors_to_raise == 0)
    pubsub.publish("trip:a:changes", "back")

    assert subscription.get_message(timeout=2)["data"] == "back"


def test_the_reader_survives_the_socket_being_closed_under_it(fanout, redis_client):
    """Releasing the last viewer closes the connection another greenlet is blocked
    reading. If that error killed the reader without clearing its running flag, every
    later viewer would be subscribed and never told anything."""
    subscription = fanout.subscribe("trip:a:changes")
    pubsub = redis_client.pubsubs[0]
    pubsub.closed_under_the_reader_errors_to_raise = 2

    assert _wait_for(lambda: pubsub.closed_under_the_reader_errors_to_raise == 0)
    pubsub.publish("trip:a:changes", "still-delivering")

    assert subscription.get_message(timeout=2)["data"] == "still-delivering"


def test_a_reader_that_ended_with_its_connection_does_not_leave_new_viewers_unserved(
    fanout, redis_client
):
    first = fanout.subscribe("trip:a:changes")
    first.close()

    second = fanout.subscribe("trip:a:changes")
    assert _wait_for(lambda: len(redis_client.pubsubs) == 2)
    redis_client.pubsubs[1].publish("trip:a:changes", "to-the-new-reader")

    assert second.get_message(timeout=2)["data"] == "to-the-new-reader"


def test_a_closed_subscription_refuses_to_be_read(fanout):
    subscription = fanout.subscribe("trip:a:changes")
    subscription.close()

    with pytest.raises(SubscriptionClosed):
        subscription.get_message(timeout=0.01)
