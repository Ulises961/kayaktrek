"""merge m8 log-autogen and trip-succession heads

Revision ID: bd19a31ac13e
Revises: 72dd69261607, 1c5a3f19190d
Create Date: 2026-07-23 08:00:46.175095

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'bd19a31ac13e'
down_revision = ('72dd69261607', '1c5a3f19190d')
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
