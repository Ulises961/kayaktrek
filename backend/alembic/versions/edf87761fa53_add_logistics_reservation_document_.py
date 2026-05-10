"""add_logistics_travel_document_shuttle

Revision ID: edf87761fa53
Revises: d7f2a4c9e1b5
Create Date: 2026-05-10 12:51:49.203736

"""
from alembic import op
import sqlalchemy as sa

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
        sa.Column('created', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['trip_id'], ['trip.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('trip_id', name='uq_logistics_trip'),
    )

    op.create_table(
        'travel_document',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('trip_id', sa.UUID(), nullable=False),
        sa.Column('owner_id', sa.UUID(), nullable=True),
        sa.Column(
            'type',
            sa.Enum('accommodation', 'transport', 'insurance', 'permit', 'other',
                    name='traveldocumenttype'),
            nullable=False,
        ),
        sa.Column('name', sa.String(length=300), nullable=False),
        sa.Column('date', sa.Date(), nullable=True),
        sa.Column('expiry_date', sa.Date(), nullable=True),
        sa.Column('confirmation_number', sa.String(length=100), nullable=True),
        sa.Column('url', sa.String(length=2048), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('attachment_path', sa.String(length=500), nullable=True),
        sa.Column('created', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['owner_id'], ['users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['trip_id'], ['trip.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_travel_document_trip_id'), 'travel_document', ['trip_id'])
    op.create_index(op.f('ix_travel_document_owner_id'), 'travel_document', ['owner_id'])

    op.create_table(
        'shuttle_vehicle',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('trip_id', sa.UUID(), nullable=False),
        sa.Column('arranged_by_id', sa.UUID(), nullable=True),
        sa.Column('driver_id', sa.UUID(), nullable=True),
        sa.Column('driver_name', sa.String(length=200), nullable=True),
        sa.Column('driver_contact', sa.String(length=200), nullable=True),
        sa.Column('seats_available', sa.Integer(), nullable=True),
        sa.Column('kayak_spots', sa.Integer(), nullable=True),
        sa.Column('vehicle_description', sa.String(length=300), nullable=True),
        sa.Column('pickup_point', sa.String(length=500), nullable=True),
        sa.Column('created', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['trip_id'], ['trip.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['arranged_by_id'], ['trip_member.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['driver_id'], ['trip_member.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_shuttle_vehicle_trip_id'), 'shuttle_vehicle', ['trip_id'])
    op.create_index(op.f('ix_shuttle_vehicle_arranged_by_id'), 'shuttle_vehicle', ['arranged_by_id'])
    op.create_index(op.f('ix_shuttle_vehicle_driver_id'), 'shuttle_vehicle', ['driver_id'])

    op.create_table(
        'shuttle_passenger',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('vehicle_id', sa.UUID(), nullable=False),
        sa.Column('trip_member_id', sa.UUID(), nullable=False),
        sa.Column('created', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['vehicle_id'], ['shuttle_vehicle.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['trip_member_id'], ['trip_member.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('vehicle_id', 'trip_member_id', name='uq_shuttle_passenger_member'),
    )
    op.create_index(op.f('ix_shuttle_passenger_vehicle_id'), 'shuttle_passenger', ['vehicle_id'])
    op.create_index(op.f('ix_shuttle_passenger_trip_member_id'), 'shuttle_passenger', ['trip_member_id'])


def downgrade() -> None:
    op.drop_index(op.f('ix_shuttle_passenger_trip_member_id'), table_name='shuttle_passenger')
    op.drop_index(op.f('ix_shuttle_passenger_vehicle_id'), table_name='shuttle_passenger')
    op.drop_table('shuttle_passenger')

    op.drop_index(op.f('ix_shuttle_vehicle_driver_id'), table_name='shuttle_vehicle')
    op.drop_index(op.f('ix_shuttle_vehicle_arranged_by_id'), table_name='shuttle_vehicle')
    op.drop_index(op.f('ix_shuttle_vehicle_trip_id'), table_name='shuttle_vehicle')
    op.drop_table('shuttle_vehicle')

    op.drop_index(op.f('ix_travel_document_owner_id'), table_name='travel_document')
    op.drop_index(op.f('ix_travel_document_trip_id'), table_name='travel_document')
    op.drop_table('travel_document')
    op.execute('DROP TYPE IF EXISTS traveldocumenttype')

    op.drop_table('logistics')
