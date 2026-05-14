"""drop_departure_arrival_travel_notes_from_logistics

Revision ID: fb1d46303f54
Revises: edf87761fa53
Create Date: 2026-05-11 17:08:12.429944

"""
from alembic import op
import sqlalchemy as sa


revision = 'fb1d46303f54'
down_revision = 'a92d21da6552'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_column('logistics', 'departure_point')
    op.drop_column('logistics', 'arrival_point')
    op.drop_column('logistics', 'travel_notes')


def downgrade() -> None:
    op.add_column('logistics', sa.Column('travel_notes', sa.Text(), nullable=True))
    op.add_column('logistics', sa.Column('arrival_point', sa.String(length=500), nullable=True))
    op.add_column('logistics', sa.Column('departure_point', sa.String(length=500), nullable=True))
