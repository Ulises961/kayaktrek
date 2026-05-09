"""add user certifications

Revision ID: c2d4f6a8b1e3
Revises: a1c3e5f7b9d2
Create Date: 2026-05-04 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = 'c2d4f6a8b1e3'
down_revision = 'a1c3e5f7b9d2'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'user_certifications',
        sa.Column('id', sa.UUID(), primary_key=True),
        sa.Column('user_id', sa.UUID(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('organization', sa.String(100), nullable=False),
        sa.Column('award', sa.String(200), nullable=False),
        sa.Column('membership_number', sa.String(100), nullable=True),
        sa.Column('awarded_at', sa.Date(), nullable=True),
        sa.Column('valid_until', sa.Date(), nullable=True),
        sa.Column('created', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated', sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index('ix_user_certifications_user_id', 'user_certifications', ['user_id'])


def downgrade():
    op.drop_index('ix_user_certifications_user_id', table_name='user_certifications')
    op.drop_table('user_certifications')
