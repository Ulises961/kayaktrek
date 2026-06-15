"""add token_version to users

Revision ID: a25543471d02
Revises: 123b40fa5bc8
Create Date: 2026-06-11 22:59:07.260458

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a25543471d02'
down_revision = '123b40fa5bc8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('users', sa.Column('token_version', sa.Integer(), server_default='0', nullable=False))


def downgrade() -> None:
    op.drop_column('users', 'token_version')
