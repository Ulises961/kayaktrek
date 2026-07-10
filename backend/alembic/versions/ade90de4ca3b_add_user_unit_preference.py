"""add user unit preference

Revision ID: ade90de4ca3b
Revises: 2cb19029513d
Create Date: 2026-07-10 22:18:00.562794

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'ade90de4ca3b'
down_revision = '2cb19029513d'
branch_labels = None
depends_on = None

unit_preference_enum = sa.Enum('nm', 'km', name='unitpreferencetype')


def upgrade() -> None:
    unit_preference_enum.create(op.get_bind(), checkfirst=True)
    op.add_column(
        'users',
        sa.Column(
            'unit_preference', unit_preference_enum,
            nullable=False, server_default='nm',
        ),
    )


def downgrade() -> None:
    op.drop_column('users', 'unit_preference')
    unit_preference_enum.drop(op.get_bind(), checkfirst=True)
