"""merge unit_preference/catalog_item and medical_notes_access_log heads

Revision ID: 088254dcfe1e
Revises: afd5e1e9d28f, f1b8e1d51ca0
Create Date: 2026-07-13 10:49:52.633022

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '088254dcfe1e'
down_revision = ('afd5e1e9d28f', 'f1b8e1d51ca0')
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
