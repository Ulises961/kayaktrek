"""Baseline: create full schema from scratch

Revision ID: a19441b232c7
Revises:
Create Date: 2023-06-28 22:06:13.002889

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql as pg
from geoalchemy2 import Geography

revision = 'a19441b232c7'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis")

    # ── Enums (checkfirst=True makes creation idempotent) ────────────────────
    pg.ENUM('draft', 'planning', 'happening', 'past',
            name='tripstatetype').create(op.get_bind(), checkfirst=True)
    pg.ENUM('leader', 'crew',
            name='memberroletype').create(op.get_bind(), checkfirst=True)
    pg.ENUM('stop', 'position', 'interest',
            name='pointtype').create(op.get_bind(), checkfirst=True)
    pg.ENUM('needed', 'covered',
            name='requirementstatustype').create(op.get_bind(), checkfirst=True)

    # ── Core entity tables ───────────────────────────────────────────────────
    op.create_table(
        'users',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('created', sa.DateTime(), nullable=False),
        sa.Column('updated', sa.DateTime(), nullable=False),
        sa.Column('mail', sa.String(255), nullable=False),
        sa.Column('pwd', sa.String(255), nullable=False),
        sa.Column('phone', sa.String(255), nullable=False),
        sa.Column('username', sa.String(255), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('surname', sa.String(255), nullable=True),
        sa.Column('admin', sa.Boolean(), nullable=True),
        sa.Column('active', sa.Boolean(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('mail'),
        sa.UniqueConstraint('phone'),
        sa.UniqueConstraint('username'),
    )

    op.create_table(
        'image',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('created', sa.DateTime(), nullable=False),
        sa.Column('updated', sa.DateTime(), nullable=False),
        sa.Column('size', sa.Numeric(), nullable=True),
        sa.Column('name', sa.String(255), nullable=True),
        sa.Column('location', sa.String(255), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )

    op.create_table(
        'trip',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('created', sa.DateTime(), nullable=False),
        sa.Column('updated', sa.DateTime(), nullable=False),
        sa.Column('state', pg.ENUM(name='tripstatetype', create_type=False), nullable=False),
        sa.Column('destination', sa.String(), nullable=True),
        sa.Column('description', sa.String(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )

    op.create_table(
        'item_categories',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('created', sa.DateTime(), nullable=False),
        sa.Column('updated', sa.DateTime(), nullable=False),
        sa.Column('slug', sa.String(100), nullable=False),
        sa.Column('name', sa.String(100), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('slug'),
        sa.UniqueConstraint('name'),
    )

    op.create_table(
        'item',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('created', sa.DateTime(), nullable=False),
        sa.Column('updated', sa.DateTime(), nullable=False),
        sa.Column('category_id', sa.UUID(), nullable=True),
        sa.Column('checked', sa.Boolean(), nullable=True),
        sa.Column('name', sa.String(255), nullable=True),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(['category_id'], ['item_categories.id']),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )

    op.create_table(
        'itinerary',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('created', sa.DateTime(), nullable=False),
        sa.Column('updated', sa.DateTime(), nullable=False),
        sa.Column('is_public', sa.Boolean(), nullable=True),
        sa.Column('total_miles', sa.Numeric(), nullable=True),
        sa.Column('expected_total_miles', sa.Numeric(), nullable=True),
        sa.Column('trip_id', sa.UUID(), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=True),
        sa.ForeignKeyConstraint(['trip_id'], ['trip.id']),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('trip_id'),
    )

    op.create_table(
        'day',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('created', sa.DateTime(), nullable=False),
        sa.Column('updated', sa.DateTime(), nullable=False),
        sa.Column('day_number', sa.Integer(), nullable=False),
        sa.Column('itinerary_id', sa.UUID(), nullable=False),
        sa.Column('date', sa.Date(), nullable=False),
        sa.ForeignKeyConstraint(['itinerary_id'], ['itinerary.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('day_number', 'itinerary_id', 'date'),
    )

    op.create_table(
        'weather',
        sa.Column('day_id', sa.UUID(), nullable=False),
        sa.Column('model', sa.String(255), nullable=True),
        sa.ForeignKeyConstraint(['day_id'], ['day.id'], name='day_foreign_key_in_weather'),
        sa.PrimaryKeyConstraint('day_id'),
    )

    op.create_table(
        'weather_state',
        sa.Column('day_id', sa.UUID(), nullable=False),
        sa.Column('time', sa.Time(), nullable=False),
        sa.Column('temperature', sa.Numeric(), nullable=True),
        sa.Column('precipitation', sa.Numeric(), nullable=True),
        sa.Column('wind_direction', sa.Numeric(), nullable=True),
        sa.Column('wind_force', sa.Numeric(), nullable=True),
        sa.Column('cloud', sa.String(255), nullable=True),
        sa.ForeignKeyConstraint(['day_id'], ['weather.day_id'],
                                name='weather_day_foreign_keys_in_weather_state'),
        sa.PrimaryKeyConstraint('day_id', 'time'),
    )

    op.create_table(
        'sea',
        sa.Column('day_id', sa.UUID(), nullable=False),
        sa.Column('moon_phase', sa.String(255), nullable=True),
        sa.Column('high_tide', sa.Time(), nullable=True),
        sa.Column('low_tide', sa.Time(), nullable=True),
        sa.Column('recorded_at', sa.DateTime(), nullable=False, server_default=sa.text('now()')),
        sa.ForeignKeyConstraint(['day_id'], ['day.id'], name='day_foreign_key_in_sea'),
        sa.PrimaryKeyConstraint('day_id'),
    )

    op.create_table(
        'sea_state',
        sa.Column('day_id', sa.UUID(), nullable=False),
        sa.Column('time', sa.Time(), nullable=False),
        sa.Column('wave_height', sa.Numeric(), nullable=True),
        sa.Column('wave_direction', sa.Numeric(), nullable=True),
        sa.Column('swell_direction', sa.Numeric(), nullable=True),
        sa.Column('swell_period', sa.Numeric(), nullable=True),
        sa.ForeignKeyConstraint(['day_id'], ['sea.day_id'],
                                name='sea_day_foreign_key_in_sea_state'),
        sa.PrimaryKeyConstraint('day_id', 'time'),
    )

    op.create_table(
        'point',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('created', sa.DateTime(), nullable=False),
        sa.Column('updated', sa.DateTime(), nullable=False),
        sa.Column('latitude', sa.Numeric(), nullable=True),
        sa.Column('longitude', sa.Numeric(), nullable=True),
        sa.Column('geo', Geography(geometry_type='POINT', srid=4326), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('type', pg.ENUM(name='pointtype', create_type=False), nullable=True),
        sa.Column('day_id', sa.UUID(), nullable=True),
        sa.Column('next_id', sa.UUID(), nullable=True),
        sa.ForeignKeyConstraint(['day_id'], ['day.id'], name='day_foreign_key_in_point'),
        sa.ForeignKeyConstraint(['next_id'], ['point.id']),
        sa.PrimaryKeyConstraint('id'),
    )

    op.create_table(
        'inventory',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('created', sa.DateTime(), nullable=False),
        sa.Column('updated', sa.DateTime(), nullable=False),
        sa.Column('trip_id', sa.UUID(), nullable=True),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(['trip_id'], ['trip.id']),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('trip_id'),
    )

    op.create_table(
        'trip_requirement',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('created', sa.DateTime(), nullable=False),
        sa.Column('updated', sa.DateTime(), nullable=False),
        sa.Column('inventory_id', sa.UUID(), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('category', sa.String(100), nullable=True),
        sa.Column('catalog_item_id', sa.UUID(), nullable=True),
        sa.Column('covering_item_id', sa.UUID(), nullable=True),
        sa.Column('checked', sa.Boolean(), nullable=False),
        sa.Column('status', pg.ENUM(name='requirementstatustype', create_type=False), nullable=False),
        sa.ForeignKeyConstraint(['inventory_id'], ['inventory.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['covering_item_id'], ['item.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )

    op.create_table(
        'log',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('created', sa.DateTime(), nullable=False),
        sa.Column('updated', sa.DateTime(), nullable=False),
        sa.Column('hours', sa.Numeric(), nullable=True),
        sa.Column('avg_sea', sa.Numeric(), nullable=True),
        sa.Column('user_id', sa.UUID(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )

    op.create_table(
        'trip_member',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('created', sa.DateTime(), nullable=False),
        sa.Column('updated', sa.DateTime(), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('trip_id', sa.UUID(), nullable=False),
        sa.Column('role', pg.ENUM(name='memberroletype', create_type=False), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['trip_id'], ['trip.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'trip_id', name='uq_trip_member_user_trip'),
    )

    # ── Junction tables ──────────────────────────────────────────────────────
    op.create_table(
        'user_has_invitation',
        sa.Column('user_id', sa.UUID(), nullable=True),
        sa.Column('trip_id', sa.UUID(), nullable=True),
        sa.Column('expiration_date', sa.Date(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['trip_id'], ['trip.id'], ondelete='CASCADE'),
    )

    op.create_table(
        'user_has_itinerary',
        sa.Column('user_id', sa.UUID(), nullable=True),
        sa.Column('itinerary_id', sa.UUID(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['itinerary_id'], ['itinerary.id'], ondelete='CASCADE'),
    )

    op.create_table(
        'user_has_inventory',
        sa.Column('user_id', sa.UUID(), nullable=True),
        sa.Column('inventory_id', sa.UUID(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['inventory_id'], ['inventory.id'], ondelete='CASCADE'),
    )

    op.create_table(
        'user_has_items',
        sa.Column('user_id', sa.UUID(), nullable=True),
        sa.Column('item_id', sa.UUID(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['item_id'], ['item.id'], ondelete='CASCADE'),
    )

    op.create_table(
        'user_endorses_log',
        sa.Column('log_id', sa.UUID(), nullable=False),
        sa.Column('endorsers', sa.UUID(), nullable=True),
        sa.ForeignKeyConstraint(['log_id'], ['log.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['endorsers'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('log_id'),
    )

    op.create_table(
        'user_has_profile_picture',
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('image_id ', sa.UUID(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['image_id '], ['image.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('user_id'),
    )

    op.create_table(
        'point_has_image',
        sa.Column('image_id', sa.UUID(), nullable=False),
        sa.Column('point_id', sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(['image_id'], ['image.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['point_id'], ['point.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('image_id', 'point_id'),
    )

    op.create_table(
        'requirement_contributors',
        sa.Column('requirement_id', sa.UUID(), nullable=False),
        sa.Column('trip_member_id', sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(['requirement_id'], ['trip_requirement.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['trip_member_id'], ['trip_member.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('requirement_id', 'trip_member_id'),
    )


def downgrade() -> None:
    op.drop_table('requirement_contributors')
    op.drop_table('point_has_image')
    op.drop_table('user_has_profile_picture')
    op.drop_table('user_endorses_log')
    op.drop_table('user_has_items')
    op.drop_table('user_has_inventory')
    op.drop_table('user_has_itinerary')
    op.drop_table('user_has_invitation')
    op.drop_table('trip_member')
    op.drop_table('log')
    op.drop_table('trip_requirement')
    op.drop_table('inventory')
    op.drop_table('point')
    op.drop_table('sea_state')
    op.drop_table('sea')
    op.drop_table('weather_state')
    op.drop_table('weather')
    op.drop_table('day')
    op.drop_table('itinerary')
    op.drop_table('item')
    op.drop_table('item_categories')
    op.drop_table('trip')
    op.drop_table('image')
    op.drop_table('users')
    op.execute("DROP TYPE IF EXISTS requirementstatustype")
    op.execute("DROP TYPE IF EXISTS pointtype")
    op.execute("DROP TYPE IF EXISTS memberroletype")
    op.execute("DROP TYPE IF EXISTS tripstatetype")
