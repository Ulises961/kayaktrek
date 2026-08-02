"""Cascade deletes down the itinerary -> day -> point chain

GDPR erasure (Tasks/erasure.py) hard-deletes the user row and relies on
itinerary.user_id's ON DELETE CASCADE to take the itineraries with it. None of
the FKs below the itinerary carried an ondelete rule, so any Day row raised a
ForeignKeyViolation and the erasure task aborted — for every user who had ever
created an itinerary, since ItineraryService always makes a Day 0.

point.next_id gets SET NULL rather than CASCADE: it points forward along the
route chain, so cascading would delete a point's predecessor when the successor
is removed.

Revision ID: c4a17d3e9b52
Revises: bd19a31ac13e
"""
from alembic import op

revision = "c4a17d3e9b52"
down_revision = "bd19a31ac13e"
branch_labels = None
depends_on = None


# (constraint name, table, referred table, local col, remote col, ondelete)
_FKS = [
    ("day_itinerary_id_fkey", "day", "itinerary", "itinerary_id", "id", "CASCADE"),
    ("day_foreign_key_in_point", "point", "day", "day_id", "id", "CASCADE"),
    ("point_next_id_fkey", "point", "point", "next_id", "id", "SET NULL"),
    ("day_foreign_key_in_weather", "weather", "day", "day_id", "id", "CASCADE"),
    ("day_foreign_key_in_sea", "sea", "day", "day_id", "id", "CASCADE"),
    (
        "weather_day_foreign_keys_in_weather_state",
        "weather_state",
        "weather",
        "day_id",
        "day_id",
        "CASCADE",
    ),
    (
        "sea_day_foreign_key_in_sea_state",
        "sea_state",
        "sea",
        "day_id",
        "day_id",
        "CASCADE",
    ),
]


def upgrade() -> None:
    for name, table, referred, local, remote, ondelete in _FKS:
        op.drop_constraint(name, table, type_="foreignkey")
        op.create_foreign_key(name, table, referred, [local], [remote], ondelete=ondelete)


def downgrade() -> None:
    for name, table, referred, local, remote, _ in _FKS:
        op.drop_constraint(name, table, type_="foreignkey")
        op.create_foreign_key(name, table, referred, [local], [remote])
