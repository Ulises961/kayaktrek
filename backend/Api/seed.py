"""
Seed helpers — idempotent inserts run once at app startup.
"""
from Api.database import db
from Models.item_category import ItemCategory

DEFAULT_CATEGORIES = [
    {"slug": "gear",       "name": "Gear"},
    {"slug": "first_aid",  "name": "First Aid"},
    {"slug": "camping",    "name": "Camping"},
    {"slug": "repair",     "name": "Repair"},
    {"slug": "travel",     "name": "Travel"},
    {"slug": "generic",    "name": "Generic"},
    {"slug": "food",       "name": "Food"},
]


def seed_item_categories() -> None:
    """Insert the default item categories if they don't already exist."""
    existing_slugs = {row.slug for row in db.session.query(ItemCategory.slug).all()}
    new_categories = [
        ItemCategory(slug=c["slug"], name=c["name"])
        for c in DEFAULT_CATEGORIES
        if c["slug"] not in existing_slugs
    ]
    if new_categories:
        db.session.add_all(new_categories)
        db.session.commit()
