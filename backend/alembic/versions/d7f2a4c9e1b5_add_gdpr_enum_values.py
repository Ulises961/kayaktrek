"""add gdpr enum values

Adds data_export and deletion_cancel to authtokentype,
and archived to tripstatetype for GDPR support (§11 and §12).

Revision ID: d7f2a4c9e1b5
Revises: c2d4f6a8b1e3
Create Date: 2026-05-05 00:00:00.000000
"""
import sqlalchemy as sa
from alembic import op

revision = 'd7f2a4c9e1b5'
down_revision = 'c2d4f6a8b1e3'
branch_labels = None
depends_on = None


def upgrade():
    # ALTER TYPE … ADD VALUE IF NOT EXISTS runs inside a transaction in PostgreSQL 12+,
    # which is our minimum supported version.
    op.execute(sa.text("ALTER TYPE authtokentype ADD VALUE IF NOT EXISTS 'data_export'"))
    op.execute(sa.text("ALTER TYPE authtokentype ADD VALUE IF NOT EXISTS 'deletion_cancel'"))
    op.execute(sa.text("ALTER TYPE tripstatetype ADD VALUE IF NOT EXISTS 'archived'"))


def downgrade():
    # PostgreSQL does not support removing enum values. Downgrade is a no-op.
    pass
