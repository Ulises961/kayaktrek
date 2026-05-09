"""add float plan fields and gdpr

Revision ID: a1c3e5f7b9d2
Revises: b3e1f8a2c047
Create Date: 2026-05-01 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

revision = 'a1c3e5f7b9d2'
down_revision = 'b3e1f8a2c047'
branch_labels = None
depends_on = None


def upgrade():
    # --- users ---
    op.add_column('users', sa.Column('vessel_make', sa.String(100), nullable=True))
    op.add_column('users', sa.Column('vessel_model', sa.String(100), nullable=True))
    op.add_column('users', sa.Column('vessel_length_cm', sa.Integer(), nullable=True))
    op.add_column('users', sa.Column('vessel_color_primary', sa.String(50), nullable=True))
    op.add_column('users', sa.Column('vessel_color_secondary', sa.String(50), nullable=True))
    op.add_column('users', sa.Column('emergency_contact_name', sa.String(200), nullable=True))
    op.add_column('users', sa.Column('emergency_contact_phone', sa.String(20), nullable=True))
    op.add_column('users', sa.Column('emergency_contact_relationship', sa.String(100), nullable=True))
    op.add_column('users', sa.Column('medical_notes_ciphertext', sa.Text(), nullable=True))
    op.add_column('users', sa.Column('medical_notes_nonce', sa.String(32), nullable=True))
    op.add_column('users', sa.Column('medical_notes_salt', sa.String(32), nullable=True))
    op.add_column('users', sa.Column('medical_notes_consent_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('users', sa.Column('deletion_requested_at', sa.DateTime(timezone=True), nullable=True))

    # --- trip_member ---
    op.add_column('trip_member', sa.Column('vessel_make', sa.String(100), nullable=True))
    op.add_column('trip_member', sa.Column('vessel_model', sa.String(100), nullable=True))
    op.add_column('trip_member', sa.Column('vessel_length_cm', sa.Integer(), nullable=True))
    op.add_column('trip_member', sa.Column('vessel_color_primary', sa.String(50), nullable=True))
    op.add_column('trip_member', sa.Column('vessel_color_secondary', sa.String(50), nullable=True))
    op.add_column('trip_member', sa.Column('emergency_contact_name', sa.String(200), nullable=True))
    op.add_column('trip_member', sa.Column('emergency_contact_phone', sa.String(20), nullable=True))
    op.add_column('trip_member', sa.Column('emergency_contact_relationship', sa.String(100), nullable=True))
    op.add_column('trip_member', sa.Column('medical_notes', sa.Text(), nullable=True))
    op.add_column('trip_member', sa.Column('medical_notes_consent_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('trip_member', sa.Column('float_plan_confirmed_at', sa.DateTime(timezone=True), nullable=True))


def downgrade():
    op.drop_column('trip_member', 'float_plan_confirmed_at')
    op.drop_column('trip_member', 'medical_notes_consent_at')
    op.drop_column('trip_member', 'medical_notes')
    op.drop_column('trip_member', 'emergency_contact_relationship')
    op.drop_column('trip_member', 'emergency_contact_phone')
    op.drop_column('trip_member', 'emergency_contact_name')
    op.drop_column('trip_member', 'vessel_color_secondary')
    op.drop_column('trip_member', 'vessel_color_primary')
    op.drop_column('trip_member', 'vessel_length_cm')
    op.drop_column('trip_member', 'vessel_model')
    op.drop_column('trip_member', 'vessel_make')

    op.drop_column('users', 'deletion_requested_at')
    op.drop_column('users', 'medical_notes_consent_at')
    op.drop_column('users', 'medical_notes_salt')
    op.drop_column('users', 'medical_notes_nonce')
    op.drop_column('users', 'medical_notes_ciphertext')
    op.drop_column('users', 'emergency_contact_relationship')
    op.drop_column('users', 'emergency_contact_phone')
    op.drop_column('users', 'emergency_contact_name')
    op.drop_column('users', 'vessel_color_secondary')
    op.drop_column('users', 'vessel_color_primary')
    op.drop_column('users', 'vessel_length_cm')
    op.drop_column('users', 'vessel_model')
    op.drop_column('users', 'vessel_make')
