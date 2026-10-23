"""add trip member shares_satellite_position

Revision ID: c4e8a1d6f2b7
Revises: 8342790b5545
Create Date: 2026-10-18 22:50:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c4e8a1d6f2b7'
down_revision = '8342790b5545'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # The default stays on the column: during a deploy the previous release's code still
    # inserts trip_member rows without this column, and a NOT NULL column with no default
    # would reject them.
    op.add_column(
        'trip_member',
        sa.Column('shares_satellite_position', sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column('trip_member', 'shares_satellite_position')
