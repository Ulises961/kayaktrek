import json
import logging
from dataclasses import dataclass
from typing import Any, Iterable, Optional, cast
from uuid import UUID

from Api.redis import live_redis

logger = logging.getLogger(__name__)

# The log is for catching a client up, not for history: a visible tab polls every few seconds,
# so what it asks for is the last handful of commits. Anything older than this is answered with
# "refresh everything", which is also the answer after a Redis flush.
LOG_MAX_ENTRIES = 100
LOG_TTL_SECONDS = 3600
# Bounds the log's worst case (100 entries of 50 changes is well under half a megabyte per
# trip). A commit that changed more rows than this — a GPX import, a route resolution — is
# logged as "too many to list" rather than stored.
MAX_CHANGES_PER_ENTRY = 50
# Bounds what one poll can return, for the same reason.
MAX_CHANGES_PER_POLL = 1000

_UNLISTABLE = "!"

# Numbers a commit and appends it in one step. Two commits to one trip could otherwise take
# revisions 5 and 6 and append them the other way round, and a poll that read between the two
# appends would move its cursor past 5 and never see it. The member is "<rev>|<changes>" so
# every entry is unique and the revision is readable without parsing the changes.
_APPEND_SCRIPT = """
local revision = redis.call('INCR', KEYS[1])
redis.call('ZADD', KEYS[2], revision, revision .. '|' .. ARGV[1])
redis.call('ZREMRANGEBYRANK', KEYS[2], 0, -tonumber(ARGV[2]) - 1)
redis.call('EXPIRE', KEYS[2], tonumber(ARGV[3]))
return revision
"""


def trip_revision_key(trip_id: str) -> str:
    return f"trip:{trip_id}:rev"


def trip_log_key(trip_id: str) -> str:
    return f"trip:{trip_id}:log"


@dataclass(frozen=True)
class TripChange:
    """One row-level change inside a trip. Carries identity only, never field values:
    a client refetches through its normal read path, so permissions are enforced
    there and not by whatever the log chose to include."""

    table: str
    record_id: UUID
    operation: str  # "create" | "update" | "delete"

    def to_wire(self) -> dict[str, str]:
        return {"t": self.table, "id": str(self.record_id), "op": self.operation}


@dataclass(frozen=True)
class TripChangesPage:
    """What a poll answers. `truncated` means the exact list of changes since the client's
    cursor cannot be given — the log was trimmed or expired, the counter went backwards, or
    the window is too large to send — so the client should refresh everything it shows."""

    rev: int
    changes: list[dict[str, str]]
    truncated: bool

    def to_wire(self) -> dict[str, Any]:
        return {"rev": self.rev, "changes": self.changes, "truncated": self.truncated}


class TripChangeService:
    """The change log clients poll (M36)."""

    @staticmethod
    def publish(trip_id: UUID, changes: Iterable[TripChange]) -> None:
        """Log one commit's changes for its trip. Fail-open: a Redis outage must never fail
        the write that already committed, it only leaves other devices stale until their
        next refresh."""
        wire_changes = sorted(
            (change.to_wire() for change in changes),
            key=lambda entry: (entry["t"], entry["id"], entry["op"]),
        )
        if not wire_changes:
            return
        trip_key = str(trip_id)
        payload = _UNLISTABLE if len(wire_changes) > MAX_CHANGES_PER_ENTRY else json.dumps(wire_changes)
        try:
            live_redis().eval(
                _APPEND_SCRIPT,
                2,
                trip_revision_key(trip_key),
                trip_log_key(trip_key),
                payload,
                LOG_MAX_ENTRIES,
                LOG_TTL_SECONDS,
            )
        except Exception as error:
            logger.warning(
                "trip_change_publish_failed",
                extra={"trip_id": trip_key, "error": str(error)},
            )

    @staticmethod
    def current_revision(trip_id: UUID | str) -> Optional[int]:
        """Where the trip's log stands now, for a page to start polling from. Taken before
        the page reads its data, so a change landing in between is reported, not missed.
        `None` when Redis cannot say: the client then takes its first poll as the baseline."""
        try:
            return int(live_redis().get(trip_revision_key(str(trip_id))) or 0)
        except Exception as error:
            logger.warning("trip_revision_unavailable", extra={"trip_id": str(trip_id), "error": str(error)})
            return None

    @staticmethod
    def changes_since(trip_id: UUID | str, since: Optional[int]) -> TripChangesPage:
        """What changed after revision `since`. With no cursor, only where things stand — the
        client is establishing a baseline. Raises when Redis is unreachable: the endpoint turns
        that into a 503, which clients back off from, rather than telling them everything
        changed."""
        client = live_redis()
        trip_key = str(trip_id)
        revision = int(client.get(trip_revision_key(trip_key)) or 0)
        if since is None or since == revision:
            return TripChangesPage(revision, [], False)
        if since > revision:
            return TripChangesPage(revision, [], True)

        members = cast(list[str], client.zrangebyscore(trip_log_key(trip_key), since + 1, "+inf"))
        entries = [member.partition("|") for member in members]
        revisions = [int(entry[0]) for entry in entries]
        # Revisions are consecutive, so a hole — at the start, because the log was trimmed or
        # expired, or in the middle — is detectable from the entries alone. So is a log that
        # stops short of the counter.
        if not revisions or revisions != list(range(since + 1, since + 1 + len(revisions))):
            return TripChangesPage(revision, [], True)
        if revisions[-1] < revision:
            return TripChangesPage(revision, [], True)
        # A commit may have landed after the counter was read; the log is then ahead of it.
        revision = revisions[-1]

        changes: list[dict[str, str]] = []
        for _, _, payload in entries:
            if payload == _UNLISTABLE:
                return TripChangesPage(revision, [], True)
            changes.extend(json.loads(payload))
            if len(changes) > MAX_CHANGES_PER_POLL:
                return TripChangesPage(revision, [], True)
        return TripChangesPage(revision, changes, False)
