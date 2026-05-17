"""collapse_trip_state_draft_planning_to_building

Revision ID: 9109e2e68a88
Revises: 72c6eddec5a7
Create Date: 2026-05-17 03:12:16.199489

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '9109e2e68a88'
down_revision = '72c6eddec5a7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # PostgreSQL does not support removing enum values in-place.
    # Strategy: cast column to text, drop old type, recreate with new values,
    # migrate existing rows, cast back.
    op.execute("ALTER TABLE trip ALTER COLUMN state TYPE VARCHAR USING state::VARCHAR")
    op.execute("DROP TYPE tripstatetype")
    op.execute("CREATE TYPE tripstatetype AS ENUM ('building', 'happening', 'past', 'archived')")
    op.execute("UPDATE trip SET state = 'building' WHERE state IN ('draft', 'planning')")
    op.execute("ALTER TABLE trip ALTER COLUMN state TYPE tripstatetype USING state::tripstatetype")


def downgrade() -> None:
    op.execute("ALTER TABLE trip ALTER COLUMN state TYPE VARCHAR USING state::VARCHAR")
    op.execute("DROP TYPE tripstatetype")
    op.execute("CREATE TYPE tripstatetype AS ENUM ('draft', 'planning', 'happening', 'past', 'archived')")
    op.execute("UPDATE trip SET state = 'draft' WHERE state = 'building'")
    op.execute("ALTER TABLE trip ALTER COLUMN state TYPE tripstatetype USING state::tripstatetype")
