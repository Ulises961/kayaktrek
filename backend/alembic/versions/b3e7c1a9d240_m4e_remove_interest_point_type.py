"""M4e §1 — remove 'interest' from pointtype enum

Points of interest are no longer route points; they are standalone Place entities
(M4e §2). The `interest` PointType is dropped from the route model. PostgreSQL has
no DROP VALUE for enums, so the type is recreated without it. Any stray `interest`
rows (none in practice — pre-production) are converted to `position` first.

Revision ID: b3e7c1a9d240
Revises: 054ac932bdef
Create Date: 2026-06-21
"""
from alembic import op

# revision identifiers, used by Alembic.
revision = 'b3e7c1a9d240'
down_revision = '054ac932bdef'
branch_labels = None
depends_on = None


def upgrade():
    op.execute("UPDATE point SET type = 'position' WHERE type = 'interest'")
    op.execute("ALTER TYPE pointtype RENAME TO pointtype_old")
    op.execute("CREATE TYPE pointtype AS ENUM ('stop', 'position')")
    op.execute(
        "ALTER TABLE point ALTER COLUMN type TYPE pointtype "
        "USING type::text::pointtype"
    )
    op.execute("DROP TYPE pointtype_old")


def downgrade():
    op.execute("ALTER TYPE pointtype RENAME TO pointtype_old")
    op.execute("CREATE TYPE pointtype AS ENUM ('stop', 'position', 'interest')")
    op.execute(
        "ALTER TABLE point ALTER COLUMN type TYPE pointtype "
        "USING type::text::pointtype"
    )
    op.execute("DROP TYPE pointtype_old")
