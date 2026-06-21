"""
Seed helpers — idempotent inserts run once at app startup.
"""
from Api.database import db
from Models.item_category import ItemCategory

DEFAULT_CATEGORIES = [
    {"slug": "gear",       "name": "Gear"},
    {"slug": "clothing",   "name": "Clothing"},
    {"slug": "first_aid",  "name": "First Aid"},
    {"slug": "camping",    "name": "Camping"},
    {"slug": "repair",     "name": "Repair"},
    {"slug": "travel",     "name": "Travel"},
    {"slug": "generic",    "name": "Generic"},
    {"slug": "food",       "name": "Food"},
]

# Default SHARED trip requirements — the group's collective kit, seeded leader-owned
# into every new trip's inventory at creation so the gear checklist never starts
# empty. One member brings each. The private per-paddler kit lives in
# DEFAULT_PERSONAL_KIT (seeded per-member at TripMember mint), not here. Flat
# hardcoded list for now; a first-class CatalogItem template entity stays deferred.
# Categories reference DEFAULT_CATEGORIES slugs above.
DEFAULT_TRIP_REQUIREMENTS = [
    {"name": "Spare paddle (split)",        "category": "gear"},
    {"name": "Group tow line",              "category": "gear"},
    {"name": "Chart + waterproof case",     "category": "gear"},
    {"name": "VHF radio",                   "category": "gear"},
    {"name": "PLB / EPIRB",                 "category": "gear"},
    {"name": "Flares / signalling mirror",  "category": "gear"},
    {"name": "Group emergency shelter",     "category": "gear"},
    {"name": "Group first aid kit",         "category": "first_aid"},
    {"name": "Repair kit",                  "category": "repair"},
    {"name": "Tent / tarp",                 "category": "camping"},
    {"name": "Stove + fuel",                "category": "camping"},
    {"name": "Cook pot / mess kit",         "category": "camping"},
    {"name": "Group extra water",           "category": "camping"},
    {"name": "Group food",                  "category": "camping"},
    {"name": "Water filter / purification", "category": "camping"},
    {"name": "Trowel",                      "category": "camping"},
    {"name": "Permits / licences",          "category": "travel"},
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
