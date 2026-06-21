"""add item.default_pack

Revision ID: f9064de2263b
Revises: b62ef0838498
Create Date: 2026-06-22 00:38:48.181349

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'f9064de2263b'
down_revision = 'b62ef0838498'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Trip-packing intent for a gear item — whether it is auto-suggested onto a
    # trip's private packing list when the user joins. Nullable; existing items
    # default to NULL (treated as "not auto-packed").
    op.add_column('item', sa.Column('default_pack', sa.Boolean(), nullable=True))


def downgrade() -> None:
    op.drop_column('item', 'default_pack')
