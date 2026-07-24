"""add trip pause resume abort fields

Revision ID: 84ad3340d977
Revises: c0bdb769f38c
Create Date: 2026-07-20 23:54:09.441904

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '84ad3340d977'
down_revision = 'c0bdb769f38c'
branch_labels = None
depends_on = None

trip_outcome_enum = sa.Enum('completed', 'interrupted', name='tripoutcometype')


def upgrade() -> None:
    trip_outcome_enum.create(op.get_bind(), checkfirst=True)
    op.add_column('trip', sa.Column('is_paused', sa.Boolean(), server_default='false', nullable=False))
    op.add_column('trip', sa.Column('paused_at', sa.Date(), nullable=True))
    op.add_column('trip', sa.Column('outcome', trip_outcome_enum, nullable=True))
    op.add_column('trip', sa.Column('last_checkpoint_alert_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column('trip', 'last_checkpoint_alert_at')
    op.drop_column('trip', 'outcome')
    op.drop_column('trip', 'paused_at')
    op.drop_column('trip', 'is_paused')
    trip_outcome_enum.drop(op.get_bind(), checkfirst=True)
