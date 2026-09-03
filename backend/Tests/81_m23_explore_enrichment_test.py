"""M23 §3 — explore-card enrichment.

The /explore card carried name, distance, day count, season and a fork attribution.
Three signals are added, chosen because each is *derivable* — none needs an author to
write anything, which matters because the live library's one route has a null
description and a null difficulty and cannot be enriched by asking nicely:

  * `author` on every route, not only forks. Attribution existed solely as
    `original_author` (the route a fork came FROM), so an original route named nobody.
  * `longest_day_miles`, the closest available substitute for the difficulty rating
    that is null in practice — it separates an easy three days from a brutal one.
  * `point_count` / `place_count` / `photo_count`, so a richly annotated route looks
    different from a bare polyline in the listing.

The region label deliberately is NOT here: it needs a bundled dataset, and that
decision was deferred rather than rushed (`plans/M23-anonymous-discovery.md`).
"""
from datetime import date

import pytest
from geoalchemy2.shape import from_shape
from shapely.geometry import Point as ShapelyPoint

from Api.database import db
from Models.day import Day
from Models.image import Image
from Models.itinerary import Itinerary
from Models.place import Place, PlaceVisibility
from Models.point import Point
from Resources.itinerary_resource import ITINERARY_ENDPOINT
from Services.Utils.route_distance import compute_day_miles, compute_total_miles

EXPLORE = f"{ITINERARY_ENDPOINT}/explore"

MED = (43.0, 8.0)
# ~6 nm north of MED, then ~48 nm further north — a deliberately lopsided two-day
# route, so "longest day" is not the same number as "half the total".
MED_SHORT_END = (43.1, 8.0)
MED_LONG_END = (43.9, 8.0)


def _geo(lat, lng):
    """Place.location is a Geography POINT, not a lat/lng pair — same construction
    GeometryField performs when deserialising a GeoJSON Point."""
    return from_shape(ShapelyPoint(lng, lat), srid=4326)


@pytest.fixture
def make_route(app, user_1, place_category_ids):
    """A public itinerary with days, points, places and photos, torn down afterwards.

    Mirrors 56_m7c's factory rather than importing it — that one knows nothing about
    places or images, and widening it would make every M7c test carry M23's fixtures.
    """
    created: list[Itinerary] = []
    category_id = next(iter(place_category_ids.values()))

    def _make(name, days_spec, *, owner=None, is_public=True, places=0, public_photos=0,
              private_photos=0):
        itinerary = Itinerary(
            name=name, is_public=is_public, user_id=(owner or user_1).id
        )
        db.session.add(itinerary)
        db.session.flush()

        prev_point = None
        first_point = None
        for day_number, day_date, coords in days_spec:
            day = Day(day_number=day_number, itinerary_id=itinerary.id, date=day_date)
            db.session.add(day)
            db.session.flush()
            for lat, lng in coords:
                point = Point(latitude=lat, longitude=lng, day_id=day.id)
                db.session.add(point)
                db.session.flush()
                if prev_point is not None:
                    prev_point.next_id = point.id
                prev_point = point
                if first_point is None:
                    first_point = point

        for index in range(places):
            db.session.add(
                Place(
                    label=f"Place {index}",
                    location=_geo(*MED),
                    category_id=category_id,
                    itinerary_id=itinerary.id,
                    visibility=PlaceVisibility.PUBLIC,
                )
            )
        # A private place must not be counted — the card is an anonymous surface.
        db.session.add(
            Place(
                label="Private",
                location=_geo(*MED),
                category_id=category_id,
                itinerary_id=itinerary.id,
                visibility=PlaceVisibility.PRIVATE,
            )
        )

        for index in range(public_photos + private_photos):
            image = Image(
                name=f"IMG_{index}.jpg", is_public=index < public_photos
            )
            db.session.add(image)
            db.session.flush()
            first_point.images.append(image)

        db.session.commit()
        created.append(itinerary)
        return itinerary

    yield _make

    for itinerary in created:
        day_ids = [d.id for d in db.session.query(Day).filter_by(itinerary_id=itinerary.id)]
        if day_ids:
            db.session.query(Point).filter(Point.day_id.in_(day_ids)).delete(
                synchronize_session=False
            )
        db.session.query(Day).filter_by(itinerary_id=itinerary.id).delete(
            synchronize_session=False
        )
        db.session.query(Place).filter_by(itinerary_id=itinerary.id).delete(
            synchronize_session=False
        )
        db.session.query(Itinerary).filter_by(id=itinerary.id).delete(
            synchronize_session=False
        )
    db.session.commit()


def _item_named(response, name):
    return next(item for item in response.json["items"] if item["name"] == name)


# --------------------------------------------------------------------------- #
# compute_day_miles                                                            #
# --------------------------------------------------------------------------- #


def test_day_miles_attributes_the_crossing_leg_to_the_day_it_arrives_in(app, make_route):
    """M20 §2's rule, applied to the aggregate: the overnight stop belongs to the day
    that ENDS there, so the leg into a day counts toward that day. A per-day walk that
    starts at each day's own first point silently drops one leg per day boundary."""
    itinerary = make_route(
        "Crossing",
        [
            (1, date(2026, 7, 1), [MED, MED_SHORT_END]),
            (2, date(2026, 7, 2), [MED_LONG_END]),
        ],
    )
    per_day = compute_day_miles(itinerary.days)

    # Day 2 holds a single point, so a naive per-day walk would score it 0.0 — its
    # whole distance IS the crossing from day 1's last point.
    assert per_day[2] > 0
    # Nothing is lost or double-counted against the total the card already shows.
    assert sum(per_day.values()) == pytest.approx(compute_total_miles(itinerary.days))


def test_day_miles_ignores_the_day_zero_staging_tail(app, make_route):
    itinerary = make_route(
        "Staging",
        [
            (0, None, [MED]),
            (1, date(2026, 7, 1), [MED_SHORT_END, MED_LONG_END]),
        ],
    )
    assert 0 not in compute_day_miles(itinerary.days)


def test_day_miles_of_an_empty_itinerary_is_empty(app):
    assert compute_day_miles([]) == {}


# --------------------------------------------------------------------------- #
# The explore payload                                                          #
# --------------------------------------------------------------------------- #


def test_explore_names_the_author_of_an_original_route(client, make_route, user_1):
    """The gap this closes: attribution existed only for forks, so an ORIGINAL route
    — every route in the library today — said nothing about who paddled it."""
    make_route("Authored", [(1, date(2026, 7, 1), [MED, MED_SHORT_END])])

    item = _item_named(client.get(EXPLORE), "Authored")

    assert item["author"] is not None
    assert item["author"]["username"] == user_1.username


def test_explore_author_is_not_linkable_when_the_profile_is_private(
    client, make_route, user_1
):
    """`linkable` mirrors profile_is_public so the card never deep-links a profile that
    would 404 or leak — the same contract `original_author` already honours."""
    user_1.profile_is_public = False
    db.session.commit()
    make_route("Private author", [(1, date(2026, 7, 1), [MED, MED_SHORT_END])])

    item = _item_named(client.get(EXPLORE), "Private author")

    assert item["author"]["linkable"] is False


def test_explore_reports_the_longest_day_not_the_average(client, make_route):
    itinerary = make_route(
        "Lopsided",
        [
            (1, date(2026, 7, 1), [MED, MED_SHORT_END]),
            (2, date(2026, 7, 2), [MED_LONG_END]),
        ],
    )
    item = _item_named(client.get(EXPLORE), "Lopsided")

    expected = max(compute_day_miles(itinerary.days).values())
    assert item["longestDayMiles"] == pytest.approx(expected, rel=1e-6)
    # The point of the field: it is strictly larger than an even split would suggest.
    assert item["longestDayMiles"] > item["totalMiles"] / 2


def test_explore_counts_points_places_and_public_photos(client, make_route):
    make_route(
        "Annotated",
        [(1, date(2026, 7, 1), [MED, MED_SHORT_END, MED_LONG_END])],
        places=2,
        public_photos=3,
        private_photos=4,
    )
    item = _item_named(client.get(EXPLORE), "Annotated")

    assert item["pointCount"] == 3
    assert item["placeCount"] == 2
    # Private photos are not in the public shape, so they must not be advertised.
    assert item["photoCount"] == 3


def test_explore_does_not_count_the_day_zero_staging_points(client, make_route):
    """Day 0 is the internal staging tail (M20 §1). It is not part of the route and a
    visitor counting waypoints must not see it."""
    make_route(
        "Staged",
        [
            (0, None, [MED]),
            (1, date(2026, 7, 1), [MED_SHORT_END, MED_LONG_END]),
        ],
    )
    assert _item_named(client.get(EXPLORE), "Staged")["pointCount"] == 2


def test_explore_enrichment_survives_a_route_with_no_annotations(client, make_route):
    """The live library's only route has none of this. Zero must render as zero, and
    an unannotated route must not 500 the anonymous front page."""
    make_route("Bare", [(1, date(2026, 7, 1), [MED, MED_SHORT_END])])

    item = _item_named(client.get(EXPLORE), "Bare")

    assert item["placeCount"] == 0
    assert item["photoCount"] == 0
    assert item["author"] is not None


def test_explore_enrichment_is_not_n_plus_one_per_route(client, make_route):
    """Places are batch-resolved for the whole page, the way fork authors already are.
    A per-row query would scale with page size on the app's most public endpoint."""
    for index in range(4):
        make_route(f"Batch {index}", [(1, date(2026, 7, 1), [MED, MED_SHORT_END])], places=1)

    from sqlalchemy import event

    statements: list[str] = []

    def record(conn, cursor, statement, params, context, executemany):
        if "FROM place" in statement:
            statements.append(statement)

    event.listen(db.engine, "before_cursor_execute", record)
    try:
        client.get(EXPLORE)
    finally:
        event.remove(db.engine, "before_cursor_execute", record)

    assert len(statements) <= 1
