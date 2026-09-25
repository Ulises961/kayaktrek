"""M9d add processed_mutation

Revision ID: c4d8e2a6f1b3
Revises: 92fbca47995b
Create Date: 2026-09-25 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c4d8e2a6f1b3'
down_revision = '92fbca47995b'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'processed_mutation',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('created', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated', sa.DateTime(timezone=True), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('entity_type', sa.String(length=50), nullable=False),
        sa.Column('operation', sa.String(length=20), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=False),
        sa.Column('reason', sa.String(length=500), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_processed_mutation_user_id'), 'processed_mutation', ['user_id'], unique=False)
    # The retention prune deletes by age.
    op.create_index(op.f('ix_processed_mutation_created'), 'processed_mutation', ['created'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_processed_mutation_created'), table_name='processed_mutation')
    op.drop_index(op.f('ix_processed_mutation_user_id'), table_name='processed_mutation')
    op.drop_table('processed_mutation')
