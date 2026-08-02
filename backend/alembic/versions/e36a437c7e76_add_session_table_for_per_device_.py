"""Add the session table backing per-device revocation (M17)

One row per device's refresh-token chain; the row id is the `sid` claim carried by
every token issued to that device.

user_id carries ON DELETE CASCADE deliberately: a table hanging off users without
one re-breaks GDPR erasure, which is exactly the class of bug c4a17d3e9b52 fixed.

Revision ID: e36a437c7e76
Revises: c4a17d3e9b52
Create Date: 2026-08-02 14:15:56.821148

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'e36a437c7e76'
down_revision = 'c4a17d3e9b52'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table('session',
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('token_version', sa.Integer(), server_default='0', nullable=False),
    sa.Column('last_used_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('revoked_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('device_label', sa.String(length=100), nullable=True),
    sa.Column('location_label', sa.String(length=150), nullable=True),
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('created', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_session_user_id'), 'session', ['user_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_session_user_id'), table_name='session')
    op.drop_table('session')
