"""replace user_has_invitation with invitation model

Revision ID: 1e0c82d804ce
Revises: 689bfe9e1479
Create Date: 2026-04-21 18:01:27.811387

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '1e0c82d804ce'
down_revision = '689bfe9e1479'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_table('user_has_invitation')

    op.create_table(
        'invitation',
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('trip_id', sa.UUID(), nullable=False),
        sa.Column('expires_at', sa.Date(), nullable=False),
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('created', sa.DateTime(), nullable=False),
        sa.Column('updated', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['trip_id'], ['trip.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'trip_id', name='uq_invitation_user_trip'),
    )


def downgrade() -> None:
    op.drop_table('invitation')

    op.create_table(
        'user_has_invitation',
        sa.Column('user_id', sa.UUID(), nullable=True),
        sa.Column('trip_id', sa.UUID(), nullable=True),
        sa.Column('expiration_date', sa.Date(), nullable=True),
        sa.ForeignKeyConstraint(['trip_id'], ['trip.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    )
