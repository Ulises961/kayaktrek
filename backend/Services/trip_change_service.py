import json
import logging
from dataclasses import dataclass
from typing import Iterable
from uuid import UUID

from Api.redis import live_redis

logger = logging.getLogger(__name__)


def trip_changes_channel(trip_id: str) -> str:
    return f"trip:{trip_id}:changes"


def trip_revision_key(trip_id: str) -> str:
    return f"trip:{trip_id}:rev"


@dataclass(frozen=True)
class TripChange:
    """One row-level change inside a trip. Carries identity only, never field values:
    a subscriber refetches through its normal read path, so permissions are enforced
    there and not by whatever the stream chose to include."""

    table: str
    record_id: UUID
    operation: str  # "create" | "update" | "delete"

    def to_wire(self) -> dict[str, str]:
        return {"t": self.table, "id": str(self.record_id), "op": self.operation}


class TripChangeService:
    """Publishes coalesced trip change notifications (M36 §WP1)."""

    @staticmethod
    def publish(trip_id: UUID, changes: Iterable[TripChange]) -> None:
        """One message per trip per commit. Fail-open: a Redis outage must never fail the
        write that already committed, it only leaves other devices stale until their
        next refetch."""
        wire_changes = sorted(
            (change.to_wire() for change in changes),
            key=lambda entry: (entry["t"], entry["id"], entry["op"]),
        )
        if not wire_changes:
            return
        trip_key = str(trip_id)
        try:
            redis_client = live_redis()
            revision = redis_client.incr(trip_revision_key(trip_key))
            message = {"rev": revision, "changes": wire_changes}
            redis_client.publish(trip_changes_channel(trip_key), json.dumps(message))
        except Exception as error:
            logger.warning(
                "trip_change_publish_failed",
                extra={"trip_id": trip_key, "error": str(error)},
            )
