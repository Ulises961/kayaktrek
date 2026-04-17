"""m2_hardening

Revision ID: 69b2d4ae420d
Revises: a19441b232c7
Create Date: 2026-04-17 17:01:45.792549

All M2 schema changes (TripMember, TripRequirement, ItemCategory, Trip.state,
Point.geo, etc.) were applied to the live DB via db.create_all() during
development.  This migration records that state as the baseline and seeds
the default ItemCategory rows so the data is present after a fresh upgrade.
"""
import uuid
from datetime import datetime, timezone

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '69b2d4ae420d'
down_revision = 'a19441b232c7'
branch_labels = None
depends_on = None

DEFAULT_CATEGORIES = [
    {"slug": "first_aid", "name": "First Aid"},
    {"slug": "camping",   "name": "Camping"},
    {"slug": "repair",    "name": "Repair"},
    {"slug": "travel",    "name": "Travel"},
    {"slug": "generic",   "name": "Generic"},
    {"slug": "food",      "name": "Food"},
]


def upgrade() -> None:
    item_categories = sa.table(
        "item_categories",
        sa.column("id",      sa.String),
        sa.column("slug",    sa.String),
        sa.column("name",    sa.String),
        sa.column("created", sa.DateTime),
        sa.column("updated", sa.DateTime),
    )

    conn = op.get_bind()
    now = datetime.now(timezone.utc)

    for cat in DEFAULT_CATEGORIES:
        exists = conn.execute(
            sa.select(item_categories.c.slug).where(item_categories.c.slug == cat["slug"])
        ).fetchone()
        if not exists:
            conn.execute(
                item_categories.insert().values(
                    id=str(__import__('uuid_extension').uuid7()),
                    slug=cat["slug"],
                    name=cat["name"],
                    created=now,
                    updated=now,
                )
            )


def downgrade() -> None:
    item_categories = sa.table("item_categories", sa.column("slug", sa.String))
    op.execute(
        item_categories.delete().where(
            item_categories.c.slug.in_([c["slug"] for c in DEFAULT_CATEGORIES])
        )
    )
