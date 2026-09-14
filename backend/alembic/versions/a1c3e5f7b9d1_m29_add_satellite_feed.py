"""M29 add satellite_feed

Revision ID: a1c3e5f7b9d1
Revises: 6a27184c0e29
Create Date: 2026-09-14 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a1c3e5f7b9d1'
down_revision = '6a27184c0e29'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'satellite_feed',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('created', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated', sa.DateTime(timezone=True), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column(
            'provider',
            sa.Enum('inreach_mapshare', 'spot', 'zoleo', 'bivy_stick', name='satelliteprovider'),
            nullable=False,
        ),
        sa.Column('feed_url', sa.String(length=500), nullable=False),
        sa.Column('feed_username', sa.String(length=200), nullable=True),
        sa.Column('feed_password_ciphertext', sa.String(length=500), nullable=True),
        sa.Column('feed_password_nonce', sa.String(length=50), nullable=True),
        sa.Column('last_polled_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('last_ingested_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('needs_reauth', sa.Boolean(), server_default='false', nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'provider', name='uq_satellite_feed_user_provider'),
    )
    op.create_index(op.f('ix_satellite_feed_user_id'), 'satellite_feed', ['user_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_satellite_feed_user_id'), table_name='satellite_feed')
    op.drop_table('satellite_feed')
    sa.Enum(name='satelliteprovider').drop(op.get_bind(), checkfirst=True)
