"""cascade delete logs on user deletion

Revision ID: 6442a35df024
Revises: b8951e7023ce
Create Date: 2026-07-11 11:26:57.395956

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '6442a35df024'
down_revision = 'b8951e7023ce'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint(op.f('log_user_id_fkey'), 'log', type_='foreignkey')
    op.create_foreign_key(
        op.f('log_user_id_fkey'), 'log', 'users', ['user_id'], ['id'], ondelete='CASCADE'
    )


def downgrade() -> None:
    op.drop_constraint(op.f('log_user_id_fkey'), 'log', type_='foreignkey')
    op.create_foreign_key(op.f('log_user_id_fkey'), 'log', 'users', ['user_id'], ['id'])
