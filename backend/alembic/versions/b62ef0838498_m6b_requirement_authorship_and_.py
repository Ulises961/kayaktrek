"""m6b requirement authorship and multi-contributor model

Replaces the single covering_item_id + requirement_contributors junction with a
RequirementContribution association object, adds proposed_by_member_id authorship,
and drops the stored status/checked columns (status becomes derived).

Revision ID: b62ef0838498
Revises: ef2fc0c514c3
Create Date: 2026-06-21 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import text
from uuid_extension import uuid7


# revision identifiers, used by Alembic.
revision = 'b62ef0838498'
down_revision = 'ef2fc0c514c3'
branch_labels = None
depends_on = None

requirement_status_enum = sa.Enum(
    'needed', 'covered', name='requirementstatustype'
)


def upgrade() -> None:
    # 1. New association object: one member bringing one owned item per requirement.
    op.create_table(
        'requirement_contribution',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('created', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated', sa.DateTime(timezone=True), nullable=False),
        sa.Column('requirement_id', sa.UUID(), nullable=False),
        sa.Column('trip_member_id', sa.UUID(), nullable=False),
        sa.Column('item_id', sa.UUID(), nullable=False),
        sa.Column('checked', sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(['requirement_id'], ['trip_requirement.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['trip_member_id'], ['trip_member.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['item_id'], ['item.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint(
            'requirement_id', 'trip_member_id',
            name='uq_requirement_contribution_req_member',
        ),
    )
    op.create_index(
        op.f('ix_requirement_contribution_requirement_id'),
        'requirement_contribution', ['requirement_id'], unique=False,
    )
    op.create_index(
        op.f('ix_requirement_contribution_trip_member_id'),
        'requirement_contribution', ['trip_member_id'], unique=False,
    )
    op.create_index(
        op.f('ix_requirement_contribution_item_id'),
        'requirement_contribution', ['item_id'], unique=False,
    )

    # 1b. Private per-member packing list.
    op.create_table(
        'personal_packing_item',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('created', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated', sa.DateTime(timezone=True), nullable=False),
        sa.Column('trip_member_id', sa.UUID(), nullable=False),
        sa.Column('item_id', sa.UUID(), nullable=False),
        sa.Column('checked', sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(['trip_member_id'], ['trip_member.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['item_id'], ['item.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint(
            'trip_member_id', 'item_id',
            name='uq_personal_packing_item_member_item',
        ),
    )
    op.create_index(
        op.f('ix_personal_packing_item_trip_member_id'),
        'personal_packing_item', ['trip_member_id'], unique=False,
    )
    op.create_index(
        op.f('ix_personal_packing_item_item_id'),
        'personal_packing_item', ['item_id'], unique=False,
    )

    # 2. Authorship column — nullable first, backfill, then enforce NOT NULL.
    op.add_column(
        'trip_requirement',
        sa.Column('proposed_by_member_id', sa.UUID(), nullable=True),
    )

    # 3. Backfill authorship: existing requirements are stamped to their trip's
    #    leader member (defaults are leader-owned by convention).
    op.execute(
        """
        UPDATE trip_requirement AS tr
        SET proposed_by_member_id = tm.id
        FROM inventory AS inv
        JOIN trip_member AS tm
          ON tm.trip_id = inv.trip_id AND tm.role = 'leader'
        WHERE tr.inventory_id = inv.id
        """
    )

    # 4. Backfill contributions from the old single covering_item_id. The member is
    #    the covering item's owner; rows where that owner is no longer a trip member
    #    are dropped (the cover is simply lost — derived status handles it).
    # UUID v7 is generated in Python (PostgreSQL has no built-in v7 generator).
    conn = op.get_bind()
    rows = conn.execute(text(
        """
        SELECT tr.id, tm.id, tr.covering_item_id, COALESCE(tr.checked, false)
        FROM trip_requirement AS tr
        JOIN item AS it ON it.id = tr.covering_item_id
        JOIN inventory AS inv ON inv.id = tr.inventory_id
        JOIN trip_member AS tm
          ON tm.trip_id = inv.trip_id AND tm.user_id = it.user_id
        WHERE tr.covering_item_id IS NOT NULL
        """
    )).fetchall()
    for req_id, member_id, item_id, checked in rows:
        conn.execute(text(
            """
            INSERT INTO requirement_contribution
                (id, created, updated, requirement_id, trip_member_id, item_id, checked)
            VALUES (:id, now(), now(), :req_id, :member_id, :item_id, :checked)
            """
        ), {"id": str(uuid7()), "req_id": str(req_id), "member_id": str(member_id),
            "item_id": str(item_id), "checked": checked})

    # 5. Enforce authorship + wire the FK/index.
    op.alter_column('trip_requirement', 'proposed_by_member_id', nullable=False)
    op.create_index(
        op.f('ix_trip_requirement_proposed_by_member_id'),
        'trip_requirement', ['proposed_by_member_id'], unique=False,
    )
    op.create_foreign_key(
        'fk_trip_requirement_proposed_by_member_id',
        'trip_requirement', 'trip_member',
        ['proposed_by_member_id'], ['id'], ondelete='CASCADE',
    )

    # 6. Drop the superseded covering/status/checked columns and the old junction.
    #    Dropping covering_item_id removes its (auto-named) FK with it.
    op.drop_column('trip_requirement', 'covering_item_id')
    op.drop_column('trip_requirement', 'status')
    op.drop_column('trip_requirement', 'checked')
    op.drop_table('requirement_contributors')

    # 7. The status enum is now unused.
    requirement_status_enum.drop(op.get_bind(), checkfirst=True)

    # 8. Invariant: every trip has exactly one inventory. Backfill an empty one for
    #    any pre-existing trip that lacks it (no requirements injected retroactively —
    #    only new trips get the seeded default set, via trip_service).
    # UUID v7 is generated in Python (PostgreSQL has no built-in v7 generator).
    trip_ids = conn.execute(text(
        """
        SELECT t.id FROM trip AS t
        WHERE NOT EXISTS (SELECT 1 FROM inventory AS i WHERE i.trip_id = t.id)
        """
    )).fetchall()
    for (trip_id,) in trip_ids:
        conn.execute(text(
            "INSERT INTO inventory (id, created, updated, trip_id) VALUES (:id, now(), now(), :trip_id)"
        ), {"id": str(uuid7()), "trip_id": str(trip_id)})


def downgrade() -> None:
    # 1. Recreate the status enum and the old columns (nullable for backfill).
    requirement_status_enum.create(op.get_bind(), checkfirst=True)
    op.add_column(
        'trip_requirement',
        sa.Column('covering_item_id', sa.UUID(), nullable=True),
    )
    op.add_column(
        'trip_requirement',
        sa.Column('checked', sa.Boolean(), nullable=True),
    )
    op.add_column(
        'trip_requirement',
        sa.Column(
            'status',
            sa.Enum('needed', 'covered', name='requirementstatustype', create_type=False),
            nullable=True,
        ),
    )
    op.create_foreign_key(
        'trip_requirement_covering_item_id_fkey',
        'trip_requirement', 'item',
        ['covering_item_id'], ['id'], ondelete='SET NULL',
    )
    op.create_index(
        op.f('ix_trip_requirement_covering_item_id'),
        'trip_requirement', ['covering_item_id'], unique=False,
    )

    # 2. Recreate the contributors junction.
    op.create_table(
        'requirement_contributors',
        sa.Column('requirement_id', sa.UUID(), nullable=False),
        sa.Column('trip_member_id', sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(['requirement_id'], ['trip_requirement.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['trip_member_id'], ['trip_member.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('requirement_id', 'trip_member_id'),
    )

    # 3. Best-effort backfill from contributions: pick one contribution per
    #    requirement as the covering item; repopulate the junction from all of them.
    op.execute(
        """
        UPDATE trip_requirement AS tr
        SET covering_item_id = rc.item_id,
            checked = rc.checked,
            status = 'covered'
        FROM (
            SELECT DISTINCT ON (requirement_id) requirement_id, item_id, checked
            FROM requirement_contribution
            ORDER BY requirement_id, created
        ) AS rc
        WHERE rc.requirement_id = tr.id
        """
    )
    op.execute(
        """
        INSERT INTO requirement_contributors (requirement_id, trip_member_id)
        SELECT DISTINCT requirement_id, trip_member_id FROM requirement_contribution
        """
    )

    # 4. Default the remaining (uncovered) rows and enforce the old NOT NULLs.
    op.execute("UPDATE trip_requirement SET status = 'needed' WHERE status IS NULL")
    op.execute("UPDATE trip_requirement SET checked = false WHERE checked IS NULL")
    op.alter_column('trip_requirement', 'status', nullable=False)
    op.alter_column('trip_requirement', 'checked', nullable=False)

    # 5. Drop the new authorship column and contribution table.
    op.drop_constraint(
        'fk_trip_requirement_proposed_by_member_id', 'trip_requirement', type_='foreignkey'
    )
    op.drop_index(
        op.f('ix_trip_requirement_proposed_by_member_id'), table_name='trip_requirement'
    )
    op.drop_column('trip_requirement', 'proposed_by_member_id')

    op.drop_index(
        op.f('ix_requirement_contribution_item_id'), table_name='requirement_contribution'
    )
    op.drop_index(
        op.f('ix_requirement_contribution_trip_member_id'), table_name='requirement_contribution'
    )
    op.drop_index(
        op.f('ix_requirement_contribution_requirement_id'), table_name='requirement_contribution'
    )
    op.drop_table('requirement_contribution')

    # Backfilled empty inventories are left in place — they are indistinguishable from
    # legitimately empty ones and harmless to keep.
    op.drop_index(
        op.f('ix_personal_packing_item_item_id'), table_name='personal_packing_item'
    )
    op.drop_index(
        op.f('ix_personal_packing_item_trip_member_id'), table_name='personal_packing_item'
    )
    op.drop_table('personal_packing_item')
