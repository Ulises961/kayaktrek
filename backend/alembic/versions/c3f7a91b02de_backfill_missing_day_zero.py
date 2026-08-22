"""backfill the missing Day 0 staging row on itineraries that never got one

Day 0 is the staging day every newly dropped point is assigned to before a day
boundary owns it. `ItineraryService.ensure_staging_day` is the enforcing function,
but two creation paths bypassed it — `fork_itinerary` (deep-copied the source's
days verbatim) and the demo seed (built days 1..N by hand). An itinerary without a
Day 0 silently refuses every new point and every day-boundary save in the builder.

Both paths are fixed in code; this repairs the rows already written. Data-only and
idempotent: it inserts one Day 0 per itinerary that has none, and re-running it
inserts nothing.

There is no meaningful downgrade — dropping a staging day would recreate the very
defect this repairs — so the down leg is a deliberate no-op.

Revision ID: c3f7a91b02de
Revises: b8d5e32f6a71
Create Date: 2026-08-22

"""
from alembic import op
import sqlalchemy as sa
import uuid_extension


revision = 'c3f7a91b02de'
down_revision = 'b8d5e32f6a71'
branch_labels = None
depends_on = None


def upgrade():
    connection = op.get_bind()
    missing = connection.execute(
        sa.text(
            """
            SELECT i.id
            FROM itinerary i
            WHERE NOT EXISTS (
                SELECT 1 FROM day d
                WHERE d.itinerary_id = i.id AND d.day_number = 0
            )
            """
        )
    ).scalars().all()

    for itinerary_id in missing:
        # UUIDv7 generated app-side, the same way BaseModel does — there is no
        # database-side default to fall back on.
        connection.execute(
            sa.text(
                """
                INSERT INTO day (id, day_number, itinerary_id, date, created, updated)
                VALUES (:id, 0, :itinerary_id, NULL, NOW(), NOW())
                """
            ),
            {"id": str(uuid_extension.uuid7()), "itinerary_id": str(itinerary_id)},
        )


def downgrade():
    pass
