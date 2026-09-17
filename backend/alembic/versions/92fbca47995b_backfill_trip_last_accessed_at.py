"""backfill trip last_accessed_at from the trip's last edit

Revision ID: 92fbca47995b
Revises: fa37f0caf434
Create Date: 2026-09-16 12:00:00.000000

The weather beat sweeps now skip a NULL last_accessed_at, so a trip nobody has
opened since fa37f0caf434 needs a real date to age from. Its last edit is the
best record of when anyone last worked on it.
"""
from alembic import op


# revision identifiers, used by Alembic.
revision = '92fbca47995b'
down_revision = 'fa37f0caf434'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("UPDATE trip SET last_accessed_at = updated WHERE last_accessed_at IS NULL")


def downgrade() -> None:
    # Backfilled values are indistinguishable from real views, so there is nothing
    # safe to undo.
    pass
