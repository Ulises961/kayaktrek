from uuid import UUID as _UUID

from sqlalchemy import UUID, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from Models.base_model import BaseModel


class SyncTombstone(BaseModel):
    """Deletion log for mobile sync-down (M9c WP1 item 1).

    `pullChanges` cannot see a row that no longer exists — absence is not
    queryable — so a device that missed a deletion keeps showing it forever.
    One row per deleted record on a synced table the device might have
    already pulled. `created` (BaseModel) is the deletion timestamp the delta
    query compares against a device's `lastPulledAt`.

    Route tables (Day, Point) are deliberately excluded — they sync through
    their own atomic whole-subtree channel (WP1 item 7), where a point
    missing from the resent set already means "deleted"; a per-record
    tombstone for them would be redundant. See
    Services.Utils.sync_tombstones' module docstring for which tables write
    here and how.
    """

    __tablename__ = "sync_tombstone"
    __table_args__ = (
        Index("ix_sync_tombstone_trip_table_created", "trip_id", "table_name", "created"),
    )

    table_name: Mapped[str] = mapped_column(String(64), nullable=False)
    record_id: Mapped[_UUID] = mapped_column(UUID, nullable=False)
    trip_id: Mapped[_UUID] = mapped_column(UUID, nullable=False, index=True)
