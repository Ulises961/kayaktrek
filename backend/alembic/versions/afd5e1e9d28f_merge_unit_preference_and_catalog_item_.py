"""merge unit_preference and catalog_item heads

Revision ID: afd5e1e9d28f
Revises: ade90de4ca3b, b8951e7023ce
Create Date: 2026-07-11 12:39:59.500644

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'afd5e1e9d28f'
down_revision = ('ade90de4ca3b', 'b8951e7023ce')
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
