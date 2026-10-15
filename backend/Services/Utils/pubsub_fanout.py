"""One Redis subscription per process, fanned out to that process's viewers (M36).

An SSE stream used to take its own `pubsub()` — its own Redis connection — so N people
watching one trip meant N subscriptions to one channel, and N connections held open for as
long as those people stayed. On the sidecar that is the second ceiling after the worker's
connection limit. Here the process holds a single Redis connection, subscribes it to each
channel while anyone is watching it, and hands every message to the local viewers' queues.
"""
import logging
import queue
import threading
import time
from typing import Any, Callable, Optional

import redis

logger = logging.getLogger(__name__)

# How long a reader waits for Redis before looking at who is still subscribed. Short enough
# that the reader notices it has been retired; it is not a delivery latency, because a
# message wakes the read immediately.
DEFAULT_POLL_SECONDS = 1.0
# What a viewer may have waiting before it is cut loose. Change events are hints, and a
# client that is 64 behind is not reading.
DEFAULT_MAX_PENDING = 64
_RECONNECT_PAUSE_SECONDS = 1.0
# Short, only to keep a connection that is closed-and-not-yet-retired from becoming a busy loop.
_CLOSED_PAUSE_SECONDS = 0.01


class SubscriptionClosed(Exception):
    """The viewer was closed, or cut loose for not reading; the stream should end."""


class Subscription:
    """One viewer's handle. Reads like redis-py's `PubSub.get_message`, so the stream
    generator that was written against a PubSub does not change shape."""

    def __init__(self, fanout: "PubSubFanout", channel: str, max_pending: int) -> None:
        self._fanout = fanout
        self.channel = channel
        self._pending: "queue.Queue[str]" = queue.Queue(maxsize=max_pending)
        self._closed = False

    def get_message(self, timeout: float = 0.0, **_: Any) -> Optional[dict[str, Any]]:
        if self._closed:
            raise SubscriptionClosed()
        try:
            data = self._pending.get(timeout=timeout)
        except queue.Empty:
            if self._closed:
                raise SubscriptionClosed()
            return None
        return {"type": "message", "channel": self.channel, "data": data}

    def close(self) -> None:
        self._fanout.release(self)

    def _deliver(self, data: str) -> None:
        try:
            self._pending.put_nowait(data)
        except queue.Full:
            self._closed = True

    def _mark_closed(self) -> None:
        self._closed = True


class PubSubFanout:
    def __init__(
        self,
        redis_factory: Callable[[], redis.Redis],
        *,
        poll_seconds: float = DEFAULT_POLL_SECONDS,
        max_pending: int = DEFAULT_MAX_PENDING,
    ) -> None:
        self._redis_factory = redis_factory
        self._poll_seconds = poll_seconds
        self._max_pending = max_pending
        self._lock = threading.Lock()
        self._viewers: dict[str, set[Subscription]] = {}
        self._pubsub: Optional[Any] = None
        # Counts connections taken. A reader belongs to one connection, and tells whether it is
        # still current by comparing this, not connection objects.
        self._generation = 0

    def subscribe(self, channel: str) -> Subscription:
        subscription = Subscription(self, channel, self._max_pending)
        with self._lock:
            if self._pubsub is None:
                # A new connection gets a reader of its own, unconditionally. The previous
                # connection's reader may still be inside a read of a socket that was just
                # closed; it exits on seeing the generation changed, so reusing it — or
                # skipping this because it "is still running" — would leave this connection
                # subscribed and unread.
                self._pubsub = self._redis_factory().pubsub()
                self._generation += 1
                threading.Thread(target=self._read, args=(self._generation,), daemon=True).start()
            viewers = self._viewers.setdefault(channel, set())
            if not viewers:
                self._pubsub.subscribe(channel)
            viewers.add(subscription)
        return subscription

    def release(self, subscription: Subscription) -> None:
        subscription._mark_closed()
        with self._lock:
            viewers = self._viewers.get(subscription.channel)
            if viewers is None or subscription not in viewers:
                return
            viewers.discard(subscription)
            if viewers:
                return
            del self._viewers[subscription.channel]
            if self._pubsub is not None:
                self._pubsub.unsubscribe(subscription.channel)
            if not self._viewers and self._pubsub is not None:
                # Nobody is watching anything: give the connection back. The reader sees
                # that the connection it holds is no longer the current one and ends.
                self._pubsub.close()
                self._pubsub = None

    def active_subscriptions(self) -> int:
        with self._lock:
            return sum(len(viewers) for viewers in self._viewers.values())

    def _read(self, generation: int) -> None:
        while True:
            with self._lock:
                pubsub = self._pubsub
                if self._generation != generation or pubsub is None or not self._viewers:
                    return
            try:
                message = pubsub.get_message(ignore_subscribe_messages=True, timeout=self._poll_seconds)
            except (redis.ConnectionError, redis.TimeoutError):
                # redis-py reconnects and re-subscribes on the next call. Messages sent
                # while it was down are gone; the client finds that out from `rev`.
                logger.warning("pubsub_fanout_connection_lost", exc_info=True)
                time.sleep(_RECONNECT_PAUSE_SECONDS)
                continue
            except (RuntimeError, ValueError, OSError):
                # The connection was closed while this reader was blocked on it, because
                # the last viewer left: redis-py reports that as any of these, depending on
                # where the read was (the sidecar harness saw ValueError). The loop's next
                # pass finds out whether this reader has been retired.
                time.sleep(_CLOSED_PAUSE_SECONDS)
                continue
            except Exception:
                # A reader that dies silently leaves its running flag set, and every
                # viewer after it is subscribed to a connection nobody reads.
                logger.exception("pubsub_fanout_reader_error")
                time.sleep(_RECONNECT_PAUSE_SECONDS)
                continue
            if message is not None and message.get("type") == "message":
                self._dispatch(message["channel"], message["data"])

    def _dispatch(self, channel: str, data: str) -> None:
        with self._lock:
            viewers = list(self._viewers.get(channel, ()))
        for subscription in viewers:
            subscription._deliver(data)
