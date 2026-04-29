"""backend consolidation pass: avatar_url, trip difficulty, item status, log fields, image location

Revision ID: b3e1f8a2c047
Revises: f4a1b3c9d2e8
Create Date: 2026-04-29 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = 'b3e1f8a2c047'
down_revision = 'f4a1b3c9d2e8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # users: replace junction-based profile picture with a direct URL column
    op.add_column('users', sa.Column('avatar_url', sa.String(length=512), nullable=True))

    # trip: difficulty enum
    op.execute("CREATE TYPE tripdifficultytype AS ENUM ('easy', 'moderate', 'demanding', 'expert')")
    op.add_column('trip', sa.Column(
        'difficulty',
        sa.Enum('easy', 'moderate', 'demanding', 'expert', name='tripdifficultytype'),
        nullable=True,
    ))

    # item: status enum
    op.execute("CREATE TYPE itemstatustype AS ENUM ('suggested', 'owned')")
    op.add_column('item', sa.Column(
        'status',
        sa.Enum('suggested', 'owned', name='itemstatustype'),
        nullable=True,
    ))

    # log: paddling date, notes, distance, and correct avg_sea to integer (Beaufort scale)
    op.add_column('log', sa.Column('date', sa.Date(), nullable=True))
    op.add_column('log', sa.Column('notes', sa.String(length=2000), nullable=True))
    op.add_column('log', sa.Column('distance', sa.Numeric(), nullable=True))
    op.alter_column('log', 'avg_sea', type_=sa.Integer(), existing_nullable=True)

    # image: widen location to hold MinIO URLs; correct size to integer bytes
    op.alter_column('image', 'location', type_=sa.String(length=512), existing_nullable=True)
    op.alter_column('image', 'size', type_=sa.Integer(), existing_nullable=True)


def downgrade() -> None:
    op.alter_column('image', 'size', type_=sa.Numeric(), existing_nullable=True)
    op.alter_column('image', 'location', type_=sa.String(length=255), existing_nullable=True)

    op.alter_column('log', 'avg_sea', type_=sa.Numeric(), existing_nullable=True)
    op.drop_column('log', 'distance')
    op.drop_column('log', 'notes')
    op.drop_column('log', 'date')

    op.drop_column('item', 'status')
    op.execute("DROP TYPE IF EXISTS itemstatustype")

    op.drop_column('trip', 'difficulty')
    op.execute("DROP TYPE IF EXISTS tripdifficultytype")

    op.drop_column('users', 'avatar_url')
