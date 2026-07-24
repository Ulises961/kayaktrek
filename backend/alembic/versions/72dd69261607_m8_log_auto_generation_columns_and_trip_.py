"""m8 log auto-generation columns and trip timezone

Revision ID: 72dd69261607
Revises: 84ad3340d977
Create Date: 2026-07-21 21:04:12.065011

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '72dd69261607'
down_revision = '84ad3340d977'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('log', sa.Column('route_geojson', postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    op.add_column('log', sa.Column('source', sa.String(length=16), server_default='manual', nullable=False))
    op.add_column('trip', sa.Column('timezone_name', sa.String(length=64), nullable=True))


def downgrade() -> None:
    op.drop_column('trip', 'timezone_name')
    op.drop_column('log', 'source')
    op.drop_column('log', 'route_geojson')
