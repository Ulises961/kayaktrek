"""m4b_itinerary_first_class_point_name_image_is_public

Revision ID: cbe929cdd0d8
Revises: 2c49d81279ae
Create Date: 2026-05-26 22:37:44.585292

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'cbe929cdd0d8'
down_revision = '2c49d81279ae'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add image.is_public with server default so existing rows get FALSE
    op.add_column('image', sa.Column('is_public', sa.Boolean(), nullable=False, server_default=sa.false()))

    # Add new itinerary columns; name + avg_speed_knots need server defaults for existing rows
    op.add_column('itinerary', sa.Column('name', sa.String(length=255), nullable=False, server_default=''))
    op.add_column('itinerary', sa.Column('avg_speed_knots', sa.Float(), nullable=False, server_default='2.5'))
    op.add_column('itinerary', sa.Column('created_from_id', sa.UUID(), nullable=True))

    # Make is_public NOT NULL (existing rows already have a value; add server default for safety)
    op.alter_column('itinerary', 'is_public', existing_type=sa.BOOLEAN(), nullable=False, server_default=sa.false())

    # Make trip_id nullable
    op.alter_column('itinerary', 'trip_id', existing_type=sa.UUID(), nullable=True)

    op.create_foreign_key(
        'fk_itinerary_created_from_id', 'itinerary', 'itinerary',
        ['created_from_id'], ['id'], ondelete='SET NULL'
    )

    op.add_column('point', sa.Column('name', sa.String(length=255), nullable=True))

    # Backfill itinerary.name from the linked trip.destination for rows that have a trip_id
    op.execute(
        "UPDATE itinerary SET name = COALESCE(trip.destination, '') "
        "FROM trip WHERE itinerary.trip_id = trip.id AND itinerary.name = ''"
    )


def downgrade() -> None:
    op.drop_column('point', 'name')
    op.drop_constraint('fk_itinerary_created_from_id', 'itinerary', type_='foreignkey')
    op.alter_column('itinerary', 'trip_id', existing_type=sa.UUID(), nullable=False)
    op.alter_column('itinerary', 'is_public', existing_type=sa.BOOLEAN(), nullable=True)
    op.drop_column('itinerary', 'created_from_id')
    op.drop_column('itinerary', 'avg_speed_knots')
    op.drop_column('itinerary', 'name')
    op.drop_column('image', 'is_public')
