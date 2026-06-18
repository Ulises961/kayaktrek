"""m4d user-created tidal diamonds

Revision ID: ef2fc0c514c3
Revises: 40f2c3a45257
Create Date: 2026-06-18 23:33:54.782084

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'ef2fc0c514c3'
down_revision = '40f2c3a45257'
branch_labels = None
depends_on = None

entry_mode_enum = sa.Enum('atlas', 'simple', name='streamentrymode')


def upgrade() -> None:
    entry_mode_enum.create(op.get_bind(), checkfirst=True)
    op.add_column('tidal_station', sa.Column('itinerary_id', sa.UUID(), nullable=True))
    op.add_column('tidal_station', sa.Column('created_by_user_id', sa.UUID(), nullable=True))
    op.add_column('tidal_station', sa.Column('radius_m', sa.Numeric(asdecimal=False), nullable=True))
    op.add_column('tidal_station', sa.Column('entry_mode', entry_mode_enum, nullable=True))
    op.create_index(op.f('ix_tidal_station_itinerary_id'), 'tidal_station', ['itinerary_id'], unique=False)
    op.create_foreign_key(
        'fk_tidal_station_created_by_user_id', 'tidal_station', 'users',
        ['created_by_user_id'], ['id'], ondelete='SET NULL',
    )
    op.create_foreign_key(
        'fk_tidal_station_itinerary_id', 'tidal_station', 'itinerary',
        ['itinerary_id'], ['id'], ondelete='CASCADE',
    )


def downgrade() -> None:
    op.drop_constraint('fk_tidal_station_itinerary_id', 'tidal_station', type_='foreignkey')
    op.drop_constraint('fk_tidal_station_created_by_user_id', 'tidal_station', type_='foreignkey')
    op.drop_index(op.f('ix_tidal_station_itinerary_id'), table_name='tidal_station')
    op.drop_column('tidal_station', 'entry_mode')
    op.drop_column('tidal_station', 'radius_m')
    op.drop_column('tidal_station', 'created_by_user_id')
    op.drop_column('tidal_station', 'itinerary_id')
    entry_mode_enum.drop(op.get_bind(), checkfirst=True)
