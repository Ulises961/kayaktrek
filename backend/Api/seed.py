"""
Seed helpers — idempotent inserts run once at app startup.
"""
from Api.database import db
from Models.item_category import ItemCategory
from Models.place_category import PlaceCategory

DEFAULT_CATEGORIES = [
    {"slug": "first_aid",  "name": "First Aid"},
    {"slug": "camping",    "name": "Camping"},
    {"slug": "repair",     "name": "Repair"},
    {"slug": "travel",     "name": "Travel"},
    {"slug": "generic",    "name": "Generic"},
    {"slug": "food",       "name": "Food"},
]

# Map-place categories (the kinds a paddler can drop). `icon` names a marker glyph
# (Lucide where available); the frontend may refine the mapping in §3.
DEFAULT_PLACE_CATEGORIES = [
    {"slug": "freshwater", "name": "Freshwater",  "icon": "droplet"},
    {"slug": "food",       "name": "Food",        "icon": "utensils"},
    {"slug": "campsite",   "name": "Campsite",    "icon": "tent"},
    {"slug": "slipway",    "name": "Slipway",     "icon": "anchor"},
    {"slug": "toilet",     "name": "Toilet",      "icon": "toilet"},
    {"slug": "hazard",     "name": "Hazard",      "icon": "triangle-alert"},
    {"slug": "viewpoint",  "name": "Viewpoint",   "icon": "eye"},
    {"slug": "shelter",    "name": "Shelter",     "icon": "house"},
    {"slug": "other",      "name": "Other",       "icon": "map-pin"},
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


def seed_place_categories() -> None:
    """Insert the default map-place categories if they don't already exist."""
    existing_slugs = {row.slug for row in db.session.query(PlaceCategory.slug).all()}
    new_categories = [
        PlaceCategory(slug=c["slug"], name=c["name"], icon=c["icon"])
        for c in DEFAULT_PLACE_CATEGORIES
        if c["slug"] not in existing_slugs
    ]
    if new_categories:
        db.session.add_all(new_categories)
        db.session.commit()
