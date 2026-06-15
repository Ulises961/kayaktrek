"""add_swell_wave_height_to_sea_state

Revision ID: 557ea7998a06
Revises: a25543471d02
Create Date: 2026-06-12 00:49:26.457028

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '557ea7998a06'
down_revision = 'a25543471d02'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('sea_state', sa.Column('swell_wave_height', sa.Numeric(asdecimal=False), nullable=True))


def downgrade() -> None:
    op.drop_column('sea_state', 'swell_wave_height')
