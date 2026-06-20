"""add medical_notes_reset_at to users

Revision ID: 40f2c3a45257
Revises: 557ea7998a06
Create Date: 2026-06-16 23:52:53.391603

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '40f2c3a45257'
down_revision = '557ea7998a06'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('users', sa.Column('medical_notes_reset_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'medical_notes_reset_at')
