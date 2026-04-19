"""add auth_token table

Revision ID: 947f3203dea5
Revises: c54b2e58f2dc
Create Date: 2026-04-19 14:58:06.351609

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '947f3203dea5'
down_revision = 'c54b2e58f2dc'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'auth_token',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('token_hash', sa.String(length=64), nullable=False),
        sa.Column('type', sa.Enum('verification', 'reset', name='authtokentype'), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('used', sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('token_hash'),
    )
    op.create_index(op.f('ix_auth_token_token_hash'), 'auth_token', ['token_hash'], unique=True)
    op.create_index(op.f('ix_auth_token_user_id'), 'auth_token', ['user_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_auth_token_user_id'), table_name='auth_token')
    op.drop_index(op.f('ix_auth_token_token_hash'), table_name='auth_token')
    op.drop_table('auth_token')
    op.execute("DROP TYPE IF EXISTS authtokentype")
