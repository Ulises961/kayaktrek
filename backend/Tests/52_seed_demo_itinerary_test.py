"""Unit tests for the ownerless public demo-itinerary seed (landing chart)."""
import pytest

from Api.database import db
from Api.seed import (
    DEMO_ITINERARY_NAME,
    DEMO_ITINERARY_ROUTE,
    seed_demo_itinerary,
)
from Models.itinerary import Itinerary
from Models.day import Day
from Models.point import Point, PointType


def _demo_itinerary() -> Itinerary:
    return (
        db.session.query(Itinerary)
        .filter(Itinerary.user_id.is_(None), Itinerary.name == DEMO_ITINERARY_NAME)
        .one()
    )


def _numbered_days(itinerary: Itinerary) -> list[Day]:
    return (
        db.session.query(Day)
        .filter(Day.itinerary_id == itinerary.id, Day.day_number > 0)
        .order_by(Day.day_number)
        .all()
    )


def _all_points(itinerary: Itinerary) -> list[Point]:
    return (
        db.session.query(Point)
        .join(Day, Point.day_id == Day.id)
        .filter(Day.itinerary_id == itinerary.id)
        .all()
    )


def test_seed_creates_ownerless_public_itinerary(app):
    seed_demo_itinerary()

    itinerary = _demo_itinerary()
    assert itinerary.is_public is True
    assert itinerary.user_id is None  # no paddler owns it
    assert itinerary.trip_id is None  # not attached to any trip/crew
    assert itinerary.name == DEMO_ITINERARY_NAME
    assert float(itinerary.avg_speed_knots) == pytest.approx(2.5)
    assert float(itinerary.total_miles) == pytest.approx(18)


def test_seed_creates_the_day_zero_staging_area(app):
    """The demo route is the first thing most users clone, and a clone with no Day 0
    silently refuses every new point and every day-boundary save in the builder."""
    seed_demo_itinerary()
    itinerary = _demo_itinerary()

    day_zeros = (
        db.session.query(Day).filter_by(itinerary_id=itinerary.id, day_number=0).all()
    )
    assert len(day_zeros) == 1
    # Staging only — the seeded route is fully bracketed into numbered days.
    assert not day_zeros[0].points


def test_seed_creates_three_numbered_days(app):
    seed_demo_itinerary()
    itinerary = _demo_itinerary()

    assert [day.day_number for day in _numbered_days(itinerary)] == [1, 2, 3]


def test_seed_chains_the_whole_route_not_one_chain_per_day(app):
    """Chaining per day leaves each day's first point an unreferenced head, and
    walk_linked_list then orders those heads by str(id) — UUIDv7 ties on the
    millisecond let the random bits decide which day the route starts with. One
    chain across the whole route means exactly one head and one tail."""
    seed_demo_itinerary()
    itinerary = _demo_itinerary()

    points = _all_points(itinerary)
    ids = {point.id for point in points}
    referenced = {point.next_id for point in points if point.next_id is not None}

    assert referenced <= ids  # the chain never points outside the itinerary
    assert len(ids - referenced) == 1  # exactly one head
    assert len([p for p in points if p.next_id is None]) == 1  # exactly one tail


def test_seed_points_are_ordered_and_match_the_route_data(app):
    """The structural chain check above can't catch a swapped lat/lng, a scrambled
    linking order, or a name/type dropped along the way — walk the actual chain and
    compare it to DEMO_ITINERARY_ROUTE element-for-element."""
    seed_demo_itinerary()
    itinerary = _demo_itinerary()

    points_by_id = {point.id: point for point in _all_points(itinerary)}
    referenced = {p.next_id for p in points_by_id.values() if p.next_id is not None}
    (head_id,) = set(points_by_id) - referenced

    ordered: list[Point] = []
    current = points_by_id[head_id]
    seen: set = set()
    while current is not None and current.id not in seen:
        ordered.append(current)
        seen.add(current.id)
        current = points_by_id.get(current.next_id)

    expected = [spec for _, point_specs in DEMO_ITINERARY_ROUTE for spec in point_specs]
    assert len(ordered) == len(expected)
    for point, (lat, lon, name, point_type) in zip(ordered, expected):
        assert float(point.latitude) == pytest.approx(lat)
        assert float(point.longitude) == pytest.approx(lon)
        assert point.name == name
        assert point.type == PointType(point_type)


def test_seed_days_share_their_boundary_stop(app):
    """A day begins where the previous one ended: the overnight stop is owned by the
    day that ends there and referenced — never duplicated — by the next day's
    start_point_id (docs/adr/itinerary-frontend.md). The seed used to give each day
    its own unshared start, so a clone of it rendered its boundaries wrong."""
    seed_demo_itinerary()
    itinerary = _demo_itinerary()

    days = _numbered_days(itinerary)
    owned = {
        day.id: db.session.query(Point).filter_by(day_id=day.id).all() for day in days
    }

    previous_end = None
    for day, (_, point_specs) in zip(days, DEMO_ITINERARY_ROUTE):
        day_points = owned[day.id]
        assert len(day_points) == len(point_specs)
        assert day.end_point_id is not None
        # The end point is one of the day's own — ownership sits with the day that
        # ends there.
        assert day.end_point_id in {point.id for point in day_points}

        if previous_end is None:
            assert day.start_point_id in {point.id for point in day_points}
        else:
            assert day.start_point_id == previous_end
        previous_end = day.end_point_id

    # Every shared boundary is a stop, which is what the builder auto-stamps them as.
    for day in days[:-1]:
        assert db.session.get(Point, day.end_point_id).type == PointType.STOP


def test_seed_is_idempotent(app):
    seed_demo_itinerary()
    seed_demo_itinerary()

    count = (
        db.session.query(Itinerary)
        .filter(Itinerary.user_id.is_(None), Itinerary.name == DEMO_ITINERARY_NAME)
        .count()
    )
    assert count == 1
