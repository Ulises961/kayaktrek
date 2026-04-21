"""add date_from and date_to to trip

Revision ID: 689bfe9e1479
Revises: 947f3203dea5
Create Date: 2026-04-21 17:47:32.939867

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '689bfe9e1479'
down_revision = '947f3203dea5'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('trip', sa.Column('date_from', sa.Date(), nullable=True))
    op.add_column('trip', sa.Column('date_to', sa.Date(), nullable=True))


def downgrade() -> None:
    op.drop_column('trip', 'date_to')
    op.drop_column('trip', 'date_from')
