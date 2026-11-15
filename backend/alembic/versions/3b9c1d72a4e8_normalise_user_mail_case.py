"""store user email addresses lower-cased, and make that a database rule

Addresses were stored exactly as typed and compared exactly, so "Name@Gmail.com" at signup and
"name@gmail.com" at password reset were two different people: the reset found nobody and, by
design, said nothing. The application now normalises on the way in (Services/Utils/mail_address.py);
this brings the rows already stored into the same form and adds a unique index on lower(mail) so
two spellings of one address can never be separate accounts again.

Refuses to run when lower-casing would merge two existing accounts — which of the two is the
real one is a human call, so it stops and says how many rather than guessing. Resolve the
collisions by hand, then run it again.

Expand-only in shape (an index and a data rewrite, no drop, no new NOT NULL). While old code is
still serving during the deploy, a user who types a capital letter is looked up exactly as before
and so can miss; that is the bug being fixed, for the length of a deploy.

Revision ID: 3b9c1d72a4e8
Revises: 45087e1ceeea
Create Date: 2026-11-15 12:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '3b9c1d72a4e8'
down_revision = '45087e1ceeea'
branch_labels = None
depends_on = None


def upgrade() -> None:
    connection = op.get_bind()
    collisions = connection.execute(sa.text(
        "SELECT count(*) FROM ("
        " SELECT lower(btrim(mail)) FROM users GROUP BY lower(btrim(mail)) HAVING count(*) > 1"
        ") AS duplicated"
    )).scalar_one()
    if collisions:
        raise RuntimeError(
            f"{collisions} email address(es) exist in more than one spelling; lower-casing "
            "would merge accounts. Find them with: SELECT lower(btrim(mail)), count(*) FROM users "
            "GROUP BY 1 HAVING count(*) > 1 — fix by hand, then re-run."
        )

    op.execute("UPDATE users SET mail = lower(btrim(mail)) WHERE mail <> lower(btrim(mail))")
    op.execute(
        "UPDATE users SET pending_mail = lower(btrim(pending_mail)) "
        "WHERE pending_mail IS NOT NULL AND pending_mail <> lower(btrim(pending_mail))"
    )
    op.create_index("uq_users_mail_lower", "users", [sa.text("lower(mail)")], unique=True)


def downgrade() -> None:
    # The rewrite of stored addresses is not undone: the original spelling is not kept.
    op.drop_index("uq_users_mail_lower", table_name="users")
