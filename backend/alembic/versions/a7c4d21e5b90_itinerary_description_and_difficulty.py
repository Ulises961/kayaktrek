"""Add Itinerary.description and Itinerary.difficulty (M19 §1)

The public shape reads Itinerary with no trip data attached (ADR-012/026), so a
route's pitch and its difficulty cannot live on Trip and be published. Both are added
here; Trip keeps its own description (the private crew brief) and its own difficulty
(the leader's call for one crew on one date). Nothing on trip is dropped.

The difficulty enum is now shared by two tables, so the Postgres type is renamed from
`tripdifficultytype` to `difficultytype` and reused — not duplicated. The rename is
in-place, so existing trip.difficulty values are untouched.

Revision ID: a7c4d21e5b90
Revises: e36a437c7e76
Create Date: 2026-08-21 17:22:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = 'a7c4d21e5b90'
down_revision = 'e36a437c7e76'
branch_labels = None
depends_on = None


def upgrade():
    op.execute("ALTER TYPE tripdifficultytype RENAME TO difficultytype")

    # create_type=False: the type already exists (renamed above), so adding a second
    # column that uses it must not re-issue CREATE TYPE.
    difficulty = postgresql.ENUM(
        'easy', 'moderate', 'demanding', 'expert',
        name='difficultytype',
        create_type=False,
    )
    op.add_column('itinerary', sa.Column('description', sa.Text(), nullable=True))
    op.add_column('itinerary', sa.Column('difficulty', difficulty, nullable=True))


def downgrade():
    op.drop_column('itinerary', 'difficulty')
    op.drop_column('itinerary', 'description')
    op.execute("ALTER TYPE difficultytype RENAME TO tripdifficultytype")
