"""m7a logs trip_id and user public profile fields

Adds:
- Log.trip_id — the endorsement key (FK trip.id, ON DELETE SET NULL, nullable, indexed).
  A standalone log (no trip) is non-endorsable; deleting a trip detaches the member's
  personal logbook entry rather than deleting it.
- User.bio / User.home_location — free-text public-profile fields.
- User.profile_is_public — opt-in public-profile gate (default false, privacy-first).

Revision ID: b07b715aef22
Revises: a2693720f005
Create Date: 2026-06-23 22:02:53.288570

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'b07b715aef22'
down_revision = 'a2693720f005'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('log', sa.Column('trip_id', sa.UUID(), nullable=True))
    op.create_index(op.f('ix_log_trip_id'), 'log', ['trip_id'], unique=False)
    op.create_foreign_key(
        op.f('fk_log_trip_id_trip'), 'log', 'trip', ['trip_id'], ['id'], ondelete='SET NULL'
    )

    op.add_column('users', sa.Column('bio', sa.String(length=1000), nullable=True))
    op.add_column('users', sa.Column('home_location', sa.String(length=255), nullable=True))
    op.add_column(
        'users',
        sa.Column(
            'profile_is_public',
            sa.Boolean(),
            server_default='false',
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column('users', 'profile_is_public')
    op.drop_column('users', 'home_location')
    op.drop_column('users', 'bio')

    op.drop_constraint(op.f('fk_log_trip_id_trip'), 'log', type_='foreignkey')
    op.drop_index(op.f('ix_log_trip_id'), table_name='log')
    op.drop_column('log', 'trip_id')
