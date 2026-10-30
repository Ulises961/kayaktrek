"""map requirement categories typed by hand to item category slugs

A requirement's category was free text, so "First aid", "first aid" and "FIRST_AID" were each
stored as typed and each made its own group on the checklist. The web form now chooses from the
item categories and stores the slug, the stable key. This maps the values already stored: one
that is an item category's slug or name, in any case and ignoring surrounding spaces, becomes
that slug. Anything else stays exactly as typed, and a row already on its slug is not touched,
so `updated` (what mobile's pull reads) moves only for rows that changed.

Data only, so it is expand-only. Not reversible: the spelling a member typed is not kept.

Revision ID: 45087e1ceeea
Revises: 907aa38bb546
Create Date: 2026-10-30 10:05:54.103824

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '45087e1ceeea'
down_revision = '907aa38bb546'
branch_labels = None
depends_on = None


def normalise_requirement_categories(connection) -> None:
    connection.execute(
        sa.text(
            """
            UPDATE trip_requirement AS requirement
            SET category = item_category.slug, updated = now()
            FROM item_categories AS item_category
            WHERE requirement.category IS NOT NULL
              AND requirement.category <> item_category.slug
              AND lower(btrim(requirement.category))
                  IN (lower(item_category.slug), lower(item_category.name))
            """
        )
    )


def upgrade() -> None:
    normalise_requirement_categories(op.get_bind())


def downgrade() -> None:
    pass
