"""M9d add trip_member left_at and left_note

Revision ID: d7a1f3c9e5b2
Revises: c4d8e2a6f1b3
Create Date: 2026-09-25 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'd7a1f3c9e5b2'
down_revision = 'c4d8e2a6f1b3'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Both nullable: every existing member is still on the trip.
    op.add_column('trip_member', sa.Column('left_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('trip_member', sa.Column('left_note', sa.String(length=500), nullable=True))


def downgrade() -> None:
    op.drop_column('trip_member', 'left_note')
    op.drop_column('trip_member', 'left_at')
