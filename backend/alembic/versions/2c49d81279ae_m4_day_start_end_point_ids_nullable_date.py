"""m4_day_start_end_point_ids_nullable_date

Revision ID: 2c49d81279ae
Revises: dd58e12950f8
Create Date: 2026-05-20 23:49:55.664774

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '2c49d81279ae'
down_revision = 'dd58e12950f8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Make date nullable (Day 0 staging area has no date)
    op.alter_column('day', 'date', existing_type=sa.Date(), nullable=True)

    # Replace (day_number, itinerary_id, date) with (day_number, itinerary_id).
    # The old constraint breaks with NULL dates; the new one is the real invariant.
    op.drop_constraint('day_day_number_itinerary_id_date_key', 'day', type_='unique')
    op.create_unique_constraint('day_day_number_itinerary_id_key', 'day', ['day_number', 'itinerary_id'])

    # Boundary-point FKs — nullable, set on PATCH when user brackets a day
    op.add_column('day', sa.Column('start_point_id', sa.UUID(), nullable=True))
    op.add_column('day', sa.Column('end_point_id', sa.UUID(), nullable=True))
    op.create_foreign_key(
        'fk_day_start_point', 'day', 'point',
        ['start_point_id'], ['id'], ondelete='SET NULL',
    )
    op.create_foreign_key(
        'fk_day_end_point', 'day', 'point',
        ['end_point_id'], ['id'], ondelete='SET NULL',
    )


def downgrade() -> None:
    op.drop_constraint('fk_day_end_point', 'day', type_='foreignkey')
    op.drop_constraint('fk_day_start_point', 'day', type_='foreignkey')
    op.drop_column('day', 'end_point_id')
    op.drop_column('day', 'start_point_id')

    op.drop_constraint('day_day_number_itinerary_id_key', 'day', type_='unique')
    op.create_unique_constraint('day_day_number_itinerary_id_date_key', 'day', ['day_number', 'itinerary_id', 'date'])

    op.alter_column('day', 'date', existing_type=sa.Date(), nullable=False)
