"""merge m4e and m6b heads

Revision ID: a2693720f005
Revises: b3e7c1a9d240, f9064de2263b
Create Date: 2026-06-22 09:50:34.570633

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a2693720f005'
down_revision = ('b3e7c1a9d240', 'f9064de2263b')
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
