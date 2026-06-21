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

# Map-place categories (the kinds a paddler can drop). `icon` is a kebab-case Lucide
# glyph name; admins can extend this catalogue at runtime via POST /api/place-categories,
# but a new icon only renders distinctly once it's added to the frontend place-icons map.
DEFAULT_PLACE_CATEGORIES = [
    # Water & sustenance
    {"slug": "freshwater",   "name": "Freshwater",    "icon": "droplet"},
    {"slug": "food",         "name": "Food",          "icon": "utensils"},
    {"slug": "shop",         "name": "Shop",          "icon": "store"},
    {"slug": "fuel",         "name": "Fuel",          "icon": "fuel"},
    {"slug": "pub",          "name": "Pub",           "icon": "beer"},
    # Sleep & shelter
    {"slug": "campsite",     "name": "Campsite",      "icon": "tent"},
    {"slug": "shelter",      "name": "Shelter",       "icon": "house"},
    {"slug": "accommodation", "name": "Accommodation", "icon": "bed"},
    # Launch & land transport
    {"slug": "slipway",      "name": "Slipway",       "icon": "anchor"},
    {"slug": "parking",      "name": "Parking",       "icon": "square-parking"},
    {"slug": "harbour",      "name": "Harbour",       "icon": "sailboat"},
    {"slug": "bus",          "name": "Bus stop",      "icon": "bus"},
    {"slug": "train",        "name": "Train station", "icon": "train-front"},
    # On-water transport
    {"slug": "ferry",        "name": "Ferry",         "icon": "ship"},
    # Hazards
    {"slug": "hazard",       "name": "Hazard",        "icon": "triangle-alert"},
    # Safety & comms
    {"slug": "lifeboat",     "name": "Lifeboat / coastguard", "icon": "life-buoy"},
    {"slug": "first_aid",    "name": "First aid",     "icon": "cross"},
    {"slug": "phone_signal", "name": "Phone signal",  "icon": "signal"},
    # Nature & scenery
    {"slug": "viewpoint",    "name": "Viewpoint",     "icon": "eye"},
    {"slug": "beach",        "name": "Beach",         "icon": "umbrella"},
    {"slug": "wildlife",     "name": "Wildlife",      "icon": "bird"},
    # Facilities
    {"slug": "toilet",       "name": "Toilet",        "icon": "toilet"},
    # Catch-all
    {"slug": "other",        "name": "Other",         "icon": "map-pin"},
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
