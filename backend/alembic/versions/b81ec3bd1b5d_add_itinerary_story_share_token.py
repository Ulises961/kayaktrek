"""add itinerary story share token

Revision ID: b81ec3bd1b5d
Revises: d5b2e8c1a3f6
Create Date: 2026-07-04 02:54:31.487883

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'b81ec3bd1b5d'
down_revision = 'd5b2e8c1a3f6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('itinerary', sa.Column('story_share_token', sa.String(length=64), nullable=True))
    op.add_column('itinerary', sa.Column('story_share_token_expires_at', sa.DateTime(timezone=True), nullable=True))
    op.create_unique_constraint('uq_itinerary_story_share_token', 'itinerary', ['story_share_token'])


def downgrade() -> None:
    op.drop_constraint('uq_itinerary_story_share_token', 'itinerary', type_='unique')
    op.drop_column('itinerary', 'story_share_token_expires_at')
    op.drop_column('itinerary', 'story_share_token')
