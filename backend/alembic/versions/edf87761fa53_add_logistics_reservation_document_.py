"""add_logistics_reservation_document_shuttle

Revision ID: edf87761fa53
Revises: d7f2a4c9e1b5
Create Date: 2026-05-10 12:51:49.203736

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'edf87761fa53'
down_revision = 'd7f2a4c9e1b5'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'logistics',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('trip_id', sa.UUID(), nullable=False),
        sa.Column('departure_point', sa.String(length=500), nullable=True),
        sa.Column('arrival_point', sa.String(length=500), nullable=True),
        sa.Column('travel_notes', sa.Text(), nullable=True),
        sa.Column('shore_contact_name', sa.String(length=200), nullable=True),
        sa.Column('shore_contact_email', sa.String(length=254), nullable=True),
        sa.Column('shore_contact_phone', sa.String(length=20), nullable=True),
        sa.Column('shore_contact_relationship', sa.String(length=100), nullable=True),
        sa.Column('shuttle_notes', sa.Text(), nullable=True),
        sa.Column('shuttle_meeting_time', sa.String(length=10), nullable=True),
        sa.Column('created', sa.DateTime(), nullable=False),
        sa.Column('updated', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['trip_id'], ['trip.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('trip_id', name='uq_logistics_trip'),
    )

    op.create_table(
        'reservation',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('trip_id', sa.UUID(), nullable=False),
        sa.Column('owner_id', sa.UUID(), nullable=True),
        sa.Column('type', sa.Enum('accommodation', 'transport', 'permit', 'other', name='reservationtype'), nullable=False),
        sa.Column('name', sa.String(length=300), nullable=False),
        sa.Column('date', sa.Date(), nullable=True),
        sa.Column('confirmation_number', sa.String(length=100), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('url', sa.String(length=2048), nullable=True),
        sa.Column('created', sa.DateTime(), nullable=False),
        sa.Column('updated', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['owner_id'], ['users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['trip_id'], ['trip.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_reservation_trip_id'), 'reservation', ['trip_id'], unique=False)
    op.create_index(op.f('ix_reservation_owner_id'), 'reservation', ['owner_id'], unique=False)

    op.create_table(
        'document',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('trip_id', sa.UUID(), nullable=False),
        sa.Column('owner_id', sa.UUID(), nullable=True),
        sa.Column('type', sa.Enum('permit', 'licence', 'insurance', 'other', name='documenttype'), nullable=False),
        sa.Column('name', sa.String(length=300), nullable=False),
        sa.Column('expiry_date', sa.Date(), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created', sa.DateTime(), nullable=False),
        sa.Column('updated', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['owner_id'], ['users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['trip_id'], ['trip.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_document_trip_id'), 'document', ['trip_id'], unique=False)
    op.create_index(op.f('ix_document_owner_id'), 'document', ['owner_id'], unique=False)

    op.create_table(
        'shuttle_assignment',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('logistics_id', sa.UUID(), nullable=False),
        sa.Column('trip_member_id', sa.UUID(), nullable=False),
        sa.Column('role', sa.Enum('driver', 'passenger', name='shuttlerole'), nullable=False),
        sa.Column('vehicle_description', sa.String(length=300), nullable=True),
        sa.Column('pickup_point', sa.String(length=500), nullable=True),
        sa.Column('created', sa.DateTime(), nullable=False),
        sa.Column('updated', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['logistics_id'], ['logistics.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['trip_member_id'], ['trip_member.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_shuttle_assignment_logistics_id'), 'shuttle_assignment', ['logistics_id'], unique=False)
    op.create_index(op.f('ix_shuttle_assignment_trip_member_id'), 'shuttle_assignment', ['trip_member_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_shuttle_assignment_trip_member_id'), table_name='shuttle_assignment')
    op.drop_index(op.f('ix_shuttle_assignment_logistics_id'), table_name='shuttle_assignment')
    op.drop_table('shuttle_assignment')
    op.execute('DROP TYPE IF EXISTS shuttlerole')

    op.drop_index(op.f('ix_document_owner_id'), table_name='document')
    op.drop_index(op.f('ix_document_trip_id'), table_name='document')
    op.drop_table('document')
    op.execute('DROP TYPE IF EXISTS documenttype')

    op.drop_index(op.f('ix_reservation_owner_id'), table_name='reservation')
    op.drop_index(op.f('ix_reservation_trip_id'), table_name='reservation')
    op.drop_table('reservation')
    op.execute('DROP TYPE IF EXISTS reservationtype')

    op.drop_table('logistics')
