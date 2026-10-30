"""decode ampersands bleach stored as entities

bleach.clean() returned HTML-safe text, so every "&" a user typed into a sanitised free-text field
was stored as "&amp;" and rendered as that literal text. The schemas now decode it on the way in
(Services/Utils/text_sanitizer.py); this repairs the rows saved before. `updated` is bumped so
mobile's pullChanges sends the corrected text to devices that already hold the escaped one.

A data repair only, so it is expand-only. Not reversible: the original ampersands cannot be told
apart from entities a user typed on purpose, and re-escaping them is the bug.

Revision ID: 907aa38bb546
Revises: c4e8a1d6f2b7
Create Date: 2026-10-30 08:52:02.347903

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '907aa38bb546'
down_revision = 'c4e8a1d6f2b7'
branch_labels = None
depends_on = None


SANITISED_TEXT_COLUMNS = {
    "trip": ("destination", "description"),
    "users": ("name", "surname", "bio", "home_location"),
    "logistics": ("shore_contact_name", "shore_contact_relationship", "shuttle_notes", "shuttle_meeting_time"),
    "travel_document": ("name", "notes", "confirmation_number", "url"),
    "shuttle_vehicle": ("driver_name", "driver_contact", "vehicle_description", "pickup_point"),
    "log": ("notes",),
    "trip_requirement": ("name", "category"),
    "itinerary": ("name", "description"),
    "trip_member": (
        "vessel_make", "vessel_model", "vessel_color_primary", "vessel_color_secondary",
        "emergency_contact_name", "emergency_contact_phone", "emergency_contact_relationship",
    ),
    "image": ("name", "caption"),
    "point": ("name", "notes"),
    "place": ("label", "note"),
    "place_categories": ("name",),
    "tidal_station": ("name", "source", "notes"),
    "wind_diamond": ("name", "notes"),
    "catalog_item": ("name",),
    "user_certifications": ("organization", "award", "membership_number"),
}


def upgrade() -> None:
    for table, columns in SANITISED_TEXT_COLUMNS.items():
        for column in columns:
            op.execute(
                sa.text(
                    f"UPDATE {table} "
                    f"SET {column} = REPLACE({column}, '&amp;', '&'), updated = now() "
                    f"WHERE {column} LIKE '%&amp;%'"
                )
            )


def downgrade() -> None:
    pass
