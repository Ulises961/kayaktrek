"""M36 — the per-trip change log a client polls: what a commit appends, what a poll gets back."""
from unittest.mock import patch
from uuid import uuid4

import pytest

from Services.trip_change_service import (
    LOG_MAX_ENTRIES,
    LOG_TTL_SECONDS,
    MAX_CHANGES_PER_ENTRY,
    MAX_CHANGES_PER_POLL,
    TripChange,
    TripChangeService,
)


def _change(table="point", operation="update"):
    return TripChange(table, uuid4(), operation)


def _publish(trip_id, count=1, table="point"):
    for _ in range(count):
        TripChangeService.publish(trip_id, [_change(table)])


def test_each_commit_is_one_entry_numbered_in_order(trip_change_redis):
    trip_id = uuid4()
    first, second = _change("point", "create"), _change("day", "update")

    TripChangeService.publish(trip_id, [first])
    TripChangeService.publish(trip_id, [second])

    entries = trip_change_redis.entries(trip_id)
    assert [entry["rev"] for entry in entries] == [1, 2]
    assert entries[0]["changes"] == [first.to_wire()]
    assert entries[1]["changes"] == [second.to_wire()]


def test_a_commit_that_changed_nothing_leaves_no_trace(trip_change_redis):
    trip_id = uuid4()

    TripChangeService.publish(trip_id, [])

    assert trip_change_redis.entries(trip_id) == []
    assert TripChangeService.changes_since(trip_id, None).rev == 0


def test_the_log_keeps_only_the_newest_entries(trip_change_redis):
    trip_id = uuid4()

    _publish(trip_id, LOG_MAX_ENTRIES + 5)

    revisions = [entry["rev"] for entry in trip_change_redis.entries(trip_id)]
    assert revisions == list(range(6, LOG_MAX_ENTRIES + 6))


def test_the_log_expires_so_an_idle_trip_costs_nothing(trip_change_redis):
    trip_id = uuid4()

    _publish(trip_id)

    assert trip_change_redis.ttls[f"trip:{trip_id}:log"] == LOG_TTL_SECONDS


def test_a_commit_too_large_to_list_is_logged_as_unlistable(trip_change_redis):
    trip_id = uuid4()

    TripChangeService.publish(trip_id, [_change() for _ in range(MAX_CHANGES_PER_ENTRY + 1)])

    assert trip_change_redis.entries(trip_id) == [{"rev": 1, "changes": None}]


def test_a_commit_at_the_size_limit_is_still_listed(trip_change_redis):
    trip_id = uuid4()

    TripChangeService.publish(trip_id, [_change() for _ in range(MAX_CHANGES_PER_ENTRY)])

    assert len(trip_change_redis.entries(trip_id)[0]["changes"]) == MAX_CHANGES_PER_ENTRY


def test_without_a_cursor_a_poll_only_reports_where_things_stand(trip_change_redis):
    trip_id = uuid4()
    _publish(trip_id, 3)

    page = TripChangeService.changes_since(trip_id, None)

    assert (page.rev, page.changes, page.truncated) == (3, [], False)


def test_a_client_that_is_up_to_date_is_told_nothing(trip_change_redis):
    trip_id = uuid4()
    _publish(trip_id, 3)

    page = TripChangeService.changes_since(trip_id, 3)

    assert (page.rev, page.changes, page.truncated) == (3, [], False)


def test_a_poll_returns_what_happened_after_the_cursor_oldest_first(trip_change_redis):
    trip_id = uuid4()
    changes = [_change("point", "create"), _change("day", "update"), _change("image", "delete")]
    for change in changes:
        TripChangeService.publish(trip_id, [change])

    page = TripChangeService.changes_since(trip_id, 1)

    assert page.rev == 3
    assert page.truncated is False
    assert page.changes == [changes[1].to_wire(), changes[2].to_wire()]


def test_a_commit_with_several_changes_is_returned_whole(trip_change_redis):
    trip_id = uuid4()
    changes = [_change("point", "update"), _change("point", "update"), _change("day", "update")]
    TripChangeService.publish(trip_id, changes)

    page = TripChangeService.changes_since(trip_id, 0)

    assert sorted(page.changes, key=str) == sorted((change.to_wire() for change in changes), key=str)


def test_a_cursor_older_than_the_log_cannot_be_answered_exactly(trip_change_redis):
    trip_id = uuid4()
    _publish(trip_id, LOG_MAX_ENTRIES + 5)

    page = TripChangeService.changes_since(trip_id, 2)

    assert page.truncated is True
    assert page.changes == []
    assert page.rev == LOG_MAX_ENTRIES + 5


def test_a_cursor_just_inside_the_log_is_answered_exactly(trip_change_redis):
    trip_id = uuid4()
    _publish(trip_id, LOG_MAX_ENTRIES + 5)

    page = TripChangeService.changes_since(trip_id, 5)

    assert page.truncated is False
    assert len(page.changes) == LOG_MAX_ENTRIES


def test_a_counter_that_went_backwards_means_the_log_was_lost(trip_change_redis):
    """A Redis flush resets the revision. A client holding a higher one learns nothing from
    an empty answer, so it is told to refresh everything."""
    trip_id = uuid4()
    _publish(trip_id, 2)

    page = TripChangeService.changes_since(trip_id, 50)

    assert (page.rev, page.changes, page.truncated) == (2, [], True)


def test_an_expired_log_with_a_surviving_counter_cannot_be_answered_exactly(trip_change_redis):
    trip_id = uuid4()
    _publish(trip_id, 3)
    trip_change_redis.expire_log(trip_id)

    page = TripChangeService.changes_since(trip_id, 1)

    assert (page.rev, page.changes, page.truncated) == (3, [], True)


def test_a_commit_too_large_to_list_makes_the_answer_inexact(trip_change_redis):
    trip_id = uuid4()
    _publish(trip_id)
    TripChangeService.publish(trip_id, [_change() for _ in range(MAX_CHANGES_PER_ENTRY + 1)])

    page = TripChangeService.changes_since(trip_id, 1)

    assert (page.changes, page.truncated) == ([], True)


def test_a_window_too_large_to_send_is_not_sent(trip_change_redis):
    trip_id = uuid4()
    commits = MAX_CHANGES_PER_POLL // MAX_CHANGES_PER_ENTRY + 1
    for _ in range(commits):
        TripChangeService.publish(trip_id, [_change() for _ in range(MAX_CHANGES_PER_ENTRY)])

    page = TripChangeService.changes_since(trip_id, 0)

    assert (page.changes, page.truncated) == ([], True)


def test_the_current_revision_is_zero_for_a_trip_nobody_has_changed(trip_change_redis):
    assert TripChangeService.current_revision(uuid4()) == 0


def test_the_current_revision_follows_the_log(trip_change_redis):
    trip_id = uuid4()
    _publish(trip_id, 4)

    assert TripChangeService.current_revision(trip_id) == 4


class _UnreachableRedis:
    def get(self, key):
        raise ConnectionError("redis unreachable")

    def eval(self, *args):
        raise ConnectionError("redis unreachable")

    def zrangebyscore(self, *args):
        raise ConnectionError("redis unreachable")


def test_the_current_revision_is_unknown_not_zero_when_redis_is_down():
    """Zero would tell a page it is at the start of a history it knows nothing about."""
    with patch("Services.trip_change_service.live_redis", return_value=_UnreachableRedis()):
        assert TripChangeService.current_revision(uuid4()) is None


def test_a_poll_fails_loudly_when_redis_is_down_so_clients_back_off():
    with patch("Services.trip_change_service.live_redis", return_value=_UnreachableRedis()):
        with pytest.raises(ConnectionError):
            TripChangeService.changes_since(uuid4(), 1)
