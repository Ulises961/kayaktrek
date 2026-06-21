"""
Seed helpers — idempotent inserts run once at app startup.
"""
from Api.database import db
from Models.item_category import ItemCategory
from Models.item import Item, ItemStatusType
from Models.personal_packing_item import PersonalPackingItem

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


# Default PRIVATE personal kit — each paddler's own gear, seeded onto their
# private packing list when they join a trip (leader at trip creation, crew on
# invitation-accept). Never lent to the group; the shared group set lives in
# DEFAULT_TRIP_REQUIREMENTS. Categories reference DEFAULT_CATEGORIES slugs above.
DEFAULT_PERSONAL_KIT = [
    {"name": "PFD (buoyancy aid)",      "category": "gear"},
    {"name": "Paddle",                  "category": "gear"},
    {"name": "Spray deck",              "category": "gear"},
    {"name": "Helmet",                  "category": "gear"},
    {"name": "Bilge pump",              "category": "gear"},
    {"name": "Paddle float",            "category": "gear"},
    {"name": "Deck compass",            "category": "gear"},
    {"name": "Whistle",                 "category": "gear"},
    {"name": "Rescue knife",            "category": "gear"},
    {"name": "Head torch + batteries",  "category": "gear"},
    {"name": "Dry bags",                "category": "gear"},
    {"name": "Sponge",                  "category": "gear"},
    {"name": "Drysuit / wetsuit",       "category": "clothing"},
    {"name": "Paddle jacket (cag)",     "category": "clothing"},
    {"name": "Pogies / gloves",         "category": "clothing"},
    {"name": "Wetsuit boots",           "category": "clothing"},
    {"name": "Thermal base layers",     "category": "clothing"},
    {"name": "Fleece / mid layer",      "category": "clothing"},
    {"name": "Insulated jacket",        "category": "clothing"},
    {"name": "Waterproof shell",        "category": "clothing"},
    {"name": "Warm hat",                "category": "clothing"},
    {"name": "Sun hat",                 "category": "clothing"},
    {"name": "Buff / neck gaiter",      "category": "clothing"},
    {"name": "Spare wool socks",        "category": "clothing"},
    {"name": "Spare underwear",         "category": "clothing"},
    {"name": "Camp shoes",              "category": "clothing"},
    {"name": "Quick-dry trousers",      "category": "clothing"},
    {"name": "Full dry change",         "category": "clothing"},
    {"name": "Personal medication",     "category": "first_aid"},
    {"name": "Sun cream",               "category": "first_aid"},
    {"name": "Lip balm",                "category": "first_aid"},
    {"name": "Sleeping bag",            "category": "camping"},
    {"name": "Sleeping mat",            "category": "camping"},
    {"name": "Mug + utensils",          "category": "camping"},
    {"name": "Drinking water",          "category": "food"},
    {"name": "Water bottles / bladder", "category": "food"},
    {"name": "Daily meals",             "category": "food"},
    {"name": "Snacks",                  "category": "food"},
    {"name": "ID / documents",          "category": "travel"},
    {"name": "Car keys",                "category": "travel"},
    {"name": "Cash / card",             "category": "travel"},
    {"name": "Phone + power bank",      "category": "generic"},
    {"name": "Sunglasses",              "category": "generic"},
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


def seed_member_packing(member) -> None:
    """Seed a trip member's private packing list from the default personal kit.

    Called wherever a TripMember is minted — the leader at trip creation, crew on
    invitation-accept — so both paths converge here. Lazy find-or-create: each
    DEFAULT_PERSONAL_KIT entry is matched in the member's gear closet by name and
    created (suggested, default_pack=True) if absent, then linked as a
    PersonalPackingItem. Idempotent: existing closet items are reused (Item is
    per-user, so later trips never duplicate gear) and packing entries already on
    this member's list are skipped. The caller owns the commit.

    Custom items the user has flagged default_pack=True are seeded too — that flag,
    not membership in the catalog, is what marks gear as "always pack on trips".
    """
    user_id = member.user_id
    category_ids = {c.slug: c.id for c in db.session.query(ItemCategory).all()}
    closet = {
        item.name: item
        for item in db.session.query(Item).filter_by(user_id=user_id).all()
    }

    # 1. Ensure every default-kit item exists in the member's gear closet.
    for spec in DEFAULT_PERSONAL_KIT:
        if spec["name"] not in closet:
            item = Item(
                name=spec["name"],
                category_id=category_ids.get(spec["category"]),
                user_id=user_id,
                status=ItemStatusType.SUGGESTED,
                default_pack=True,
            )
            db.session.add(item)
            closet[spec["name"]] = item
    db.session.flush()  # assign ids to any newly-created items

    # 2. Link a packing entry for every default-pack closet item not already listed.
    already_listed = {
        p.item_id
        for p in db.session.query(PersonalPackingItem)
        .filter_by(trip_member_id=member.id)
        .all()
    }
    for item in closet.values():
        if item.default_pack and item.id not in already_listed:
            db.session.add(
                PersonalPackingItem(
                    trip_member_id=member.id,
                    item_id=item.id,
                    checked=False,
                )
            )
            already_listed.add(item.id)
