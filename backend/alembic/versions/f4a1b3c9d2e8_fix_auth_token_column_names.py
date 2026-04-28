"""fix auth_token column names: created_at/updated_at -> created/updated

Revision ID: f4a1b3c9d2e8
Revises: 1e0c82d804ce
Create Date: 2026-04-28 11:30:00.000000

"""
from alembic import op


# revision identifiers, used by Alembic.
revision = 'f4a1b3c9d2e8'
down_revision = '1e0c82d804ce'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column('auth_token', 'created_at', new_column_name='created')
    op.alter_column('auth_token', 'updated_at', new_column_name='updated')


def downgrade() -> None:
    op.alter_column('auth_token', 'created', new_column_name='created_at')
    op.alter_column('auth_token', 'updated', new_column_name='updated_at')
