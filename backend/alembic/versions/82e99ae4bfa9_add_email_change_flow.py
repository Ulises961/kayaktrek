"""add email change flow

Revision ID: 82e99ae4bfa9
Revises: 088254dcfe1e
Create Date: 2026-07-13 10:50:29.608222

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '82e99ae4bfa9'
down_revision = '088254dcfe1e'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('users', sa.Column('pending_mail', sa.String(length=255), nullable=True))
    # ALTER TYPE … ADD VALUE IF NOT EXISTS runs inside a transaction in PostgreSQL 12+,
    # which is our minimum supported version.
    op.execute(sa.text("ALTER TYPE authtokentype ADD VALUE IF NOT EXISTS 'email_change'"))


def downgrade() -> None:
    op.drop_column('users', 'pending_mail')
    # PostgreSQL does not support removing enum values. Downgrade is a no-op for that half.
