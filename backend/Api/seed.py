"""
Seed helpers — idempotent inserts run once at app startup.
"""
import logging

from sqlalchemy.dialects.postgresql import insert as pg_insert

from Api.database import db
from Models.item_category import ItemCategory
from Models.item import Item, ItemStatusType
from Models.personal_packing_item import PersonalPackingItem
from Models.place_category import PlaceCategory
from Models.itinerary import Itinerary
from Models.day import Day
from Models.point import Point, PointType
from Services.itinerary_service import ItineraryService
from Services.Utils.point_ordering import chain_in_order

logger = logging.getLogger(__name__)

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

# Map-place categories (the kinds a paddler can drop). `icon` is a kebab-case Lucide
# glyph name; admins can extend this catalogue at runtime via POST /api/place-categories,
# but a new icon only renders distinctly once it's added to the frontend place-icons map.
DEFAULT_PLACE_CATEGORIES = [
    # Water & sustenance
    {"slug": "freshwater",   "name": "Freshwater",    "icon": "droplet"},
    {"slug": "food",         "name": "Food",          "icon": "utensils"},
    {"slug": "shop",         "name": "Shop",          "icon": "store"},
    {"slug": "kayak_rental", "name": "Kayak rental",  "icon": "kayak"},
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
    """Insert the default item categories if they don't already exist.

    Uses an atomic ON CONFLICT DO NOTHING upsert so that concurrent startups
    (backend, worker and migrate containers all call createApp at once) never
    race on the check-then-insert and crash on a UniqueViolation.
    """
    stmt = (
        pg_insert(ItemCategory)
        .values(DEFAULT_CATEGORIES)
        .on_conflict_do_nothing(index_elements=["slug"])
    )
    db.session.execute(stmt)
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
            
def seed_place_categories() -> None:
    """Insert the default map-place categories if they don't already exist.

    Atomic ON CONFLICT DO NOTHING upsert — concurrency-safe across simultaneous
    container startups (see seed_item_categories).
    """
    stmt = (
        pg_insert(PlaceCategory)
        .values(DEFAULT_PLACE_CATEGORIES)
        .on_conflict_do_nothing(index_elements=["slug"])
    )
    db.session.execute(stmt)
    db.session.commit()


# Ownerless public demo passage drawn on the landing chart. A real three-day
# Costa Brava route (Roses → Cap de Creus → Port de la Selva): each entry lists the
# points that day **owns**, as (latitude, longitude, name, type). The route is
# continuous — a day begins where the previous one ended, so an overnight stop is
# owned by the day that ends there and merely referenced by the next day's
# start_point_id, never duplicated. Each day's last point is therefore its overnight
# stop; its first owned point is the one after the previous day's stop. The landing
# derives its ambient sea/forecast animation client-side from this geometry, so the
# points are all it needs.
DEMO_ITINERARY_NAME = "Costa Brava — Roses to Cap de Creus"
DEMO_ITINERARY_ROUTE: list[tuple[int, list[tuple[float, float, str | None, str]]]] = [
    (1, [
        (42.2619, 3.1764, "Roses", "stop"),
        (42.2548, 3.2010, None, "position"),
        (42.2470, 3.2330, None, "position"),
        (42.2447, 3.2480, "Cala Montjoi", "stop"),
    ]),
    (2, [
        (42.2360, 3.2560, "Cap Norfeu", "position"),
        (42.2520, 3.2820, None, "position"),
        (42.2710, 3.2840, None, "position"),
        (42.2887, 3.2780, "Cadaqués", "stop"),
    ]),
    (3, [
        (42.3010, 3.3050, None, "position"),
        (42.3190, 3.3230, "Cap de Creus", "position"),
        (42.3320, 3.2720, None, "position"),
        (42.3380, 3.2010, "Port de la Selva", "stop"),
    ]),
]


def seed_demo_itinerary() -> None:
    """Seed the ownerless public 'Costa Brava' demo itinerary for the landing chart.

    The landing fetches real public itineraries (GET /api/v1/itinerary/explore); on
    an empty database the chart would be bare water. This seeds one always-present
    public passage so the chart, its stop/waypoint markers, and the client-side
    ambient sea/forecast animation always have a region to render.

    Ownerless by design: user_id and trip_id are both NULL, so no paddler owns it,
    it never appears in anyone's /itinerary/all, it has no trip/crew, and it is
    read-only (update_itinerary refuses public itineraries). Idempotent: a no-op
    once a demo itinerary with this name already exists.
    """
    already_seeded = (
        db.session.query(Itinerary.id)
        .filter(Itinerary.user_id.is_(None), Itinerary.name == DEMO_ITINERARY_NAME)
        .first()
    )
    if already_seeded is not None:
        return

    itinerary = Itinerary(
        name=DEMO_ITINERARY_NAME,
        is_public=True,
        avg_speed_knots=2.5,
        total_miles=18,
        user_id=None,
        trip_id=None,
    )
    db.session.add(itinerary)
    db.session.flush()

    # Day 0 is the staging area every dropped point lands in. A seeded route is the
    # first thing most users clone, and a clone with no Day 0 silently refuses every
    # edit — so it goes through the same enforcing function every other creation
    # path does, rather than being hand-built here.
    ItineraryService.ensure_staging_day(itinerary)

    built: list[tuple[Day, list[Point]]] = []
    route: list[Point] = []
    for day_number, point_specs in DEMO_ITINERARY_ROUTE:
        day = Day(day_number=day_number, itinerary_id=itinerary.id, date=None)
        db.session.add(day)
        db.session.flush()

        day_points: list[Point] = []
        for latitude, longitude, name, point_type in point_specs:
            point = Point(
                latitude=latitude,
                longitude=longitude,
                geo=f"SRID=4326;POINT({longitude} {latitude})",
                name=name,
                type=PointType(point_type),
                day_id=day.id,
            )
            db.session.add(point)
            day_points.append(point)
        built.append((day, day_points))
        route.extend(day_points)

    db.session.flush()  # assign point ids before chaining the linked list

    # One chain for the whole route, not one per day. Chaining per day leaves every
    # day's first point an unreferenced head, and walk_linked_list then orders those
    # heads by str(id) — UUIDv7 ties on the millisecond let the random bits decide
    # which day the route starts with.
    chain_in_order(route)

    # A day begins where the previous one ended: the overnight stop belongs to the
    # day that ends there and is referenced, never duplicated, by the next day's
    # start_point_id (docs/adr/itinerary-frontend.md). Day 1 starts at its own first
    # point because nothing precedes it.
    previous_end: Point | None = None
    for day, day_points in built:
        day.start_point_id = (previous_end or day_points[0]).id
        day.end_point_id = day_points[-1].id
        previous_end = day_points[-1]

    db.session.commit()
    logger.info("demo_itinerary_seeded", extra={"itinerary_id": str(itinerary.id)})
