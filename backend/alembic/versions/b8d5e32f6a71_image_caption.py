"""Add Image.caption (M19 §2)

The itinerary gallery is flat and single-source, so nothing groups the photos into
labelled sections — the caption is what tells a reader they are looking at the
parking rather than the beach. Optional: it falls back to the point's own name and
day, because most authors will not write one.

Distinct from Image.name, which is the original upload filename and was never
author-written despite an old comment in ImageSchema calling it a caption.

Revision ID: b8d5e32f6a71
Revises: a7c4d21e5b90
Create Date: 2026-08-22 10:40:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'b8d5e32f6a71'
down_revision = 'a7c4d21e5b90'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('image', sa.Column('caption', sa.String(length=300), nullable=True))


def downgrade():
    op.drop_column('image', 'caption')
