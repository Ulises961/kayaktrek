"""M36 — the change log's append script, run against a real Redis.

`Tests/conftest.py`'s `FakeTripChangeRedis` stands in for the script everywhere else. This
file is what keeps that stand-in honest: it runs the real script, and it skips (rather than
fails) when no Redis is reachable, which is how CI runs. It uses database 15, never the one
the app uses."""
import os
import threading
from unittest.mock import patch
from uuid import uuid4

import pytest
import redis

from Services.trip_change_service import (
    LOG_MAX_ENTRIES,
    LOG_TTL_SECONDS,
    TripChange,
    TripChangeService,
    trip_log_key,
    trip_revision_key,
)

_TEST_DATABASE = 15


def _connect():
    base = os.getenv("LIVE_REDIS_URL", "redis://localhost:6379/3").rsplit("/", 1)[0]
    client = redis.Redis.from_url(f"{base}/{_TEST_DATABASE}", decode_responses=True, socket_connect_timeout=0.5)
    try:
        client.ping()
    except redis.RedisError:
        return None
    return client


_real_redis = _connect()
pytestmark = pytest.mark.skipif(_real_redis is None, reason="no Redis reachable for the contract test")


@pytest.fixture
def real_log():
    trip_ids = []

    def trip():
        trip_id = uuid4()
        trip_ids.append(str(trip_id))
        return trip_id

    with patch("Services.trip_change_service.live_redis", return_value=_real_redis):
        yield trip
    for trip_id in trip_ids:
        _real_redis.delete(trip_revision_key(trip_id), trip_log_key(trip_id))


def _change():
    return TripChange("point", uuid4(), "update")


def test_the_script_numbers_commits_consecutively_and_scores_each_by_its_revision(real_log):
    trip_id = real_log()

    TripChangeService.publish(trip_id, [_change()])
    TripChangeService.publish(trip_id, [_change()])

    members = _real_redis.zrange(trip_log_key(str(trip_id)), 0, -1, withscores=True)
    assert [(member.split("|")[0], score) for member, score in members] == [("1", 1.0), ("2", 2.0)]
    assert _real_redis.get(trip_revision_key(str(trip_id))) == "2"


def test_the_script_keeps_the_newest_entries_and_sets_an_expiry(real_log):
    trip_id = real_log()

    for _ in range(LOG_MAX_ENTRIES + 5):
        TripChangeService.publish(trip_id, [_change()])

    log_key = trip_log_key(str(trip_id))
    assert _real_redis.zcard(log_key) == LOG_MAX_ENTRIES
    assert int(_real_redis.zrange(log_key, 0, 0)[0].split("|")[0]) == 6
    assert 0 < _real_redis.ttl(log_key) <= LOG_TTL_SECONDS


def test_a_poll_reads_back_what_was_logged(real_log):
    trip_id = real_log()
    first, second, third = _change(), _change(), _change()
    for change in (first, second, third):
        TripChangeService.publish(trip_id, [change])

    page = TripChangeService.changes_since(trip_id, 1)

    assert (page.rev, page.truncated) == (3, False)
    assert page.changes == [second.to_wire(), third.to_wire()]


def test_commits_racing_for_one_trip_are_logged_in_the_order_they_were_numbered(real_log):
    """The reason the number and the append are one script: with two steps, a reader could
    see revision 6 logged before 5 and move its cursor past 5 for good."""
    trip_id = real_log()
    workers, commits_each = 8, 25

    def commit_repeatedly():
        for _ in range(commits_each):
            TripChangeService.publish(trip_id, [_change()])

    threads = [threading.Thread(target=commit_repeatedly) for _ in range(workers)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    total = workers * commits_each
    assert _real_redis.get(trip_revision_key(str(trip_id))) == str(total)
    revisions = [int(member.split("|")[0]) for member in _real_redis.zrange(trip_log_key(str(trip_id)), 0, -1)]
    assert revisions == list(range(total - LOG_MAX_ENTRIES + 1, total + 1))
    page = TripChangeService.changes_since(trip_id, total - 10)
    assert (page.rev, page.truncated, len(page.changes)) == (total, False, 10)
