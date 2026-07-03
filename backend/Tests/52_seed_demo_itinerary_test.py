"""Unit tests for the ownerless public demo-itinerary seed (landing chart)."""
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


def test_seed_creates_ownerless_public_itinerary(app):
    seed_demo_itinerary()

    itinerary = _demo_itinerary()
    assert itinerary.is_public is True
    assert itinerary.user_id is None  # no paddler owns it
    assert itinerary.trip_id is None  # not attached to any trip/crew


def test_seed_creates_three_days_with_chained_points(app):
    seed_demo_itinerary()
    itinerary = _demo_itinerary()

    days = (
        db.session.query(Day)
        .filter_by(itinerary_id=itinerary.id)
        .order_by(Day.day_number)
        .all()
    )
    assert [day.day_number for day in days] == [1, 2, 3]

    for day, (_, point_specs) in zip(days, DEMO_ITINERARY_ROUTE):
        points = db.session.query(Point).filter_by(day_id=day.id).all()
        assert len(points) == len(point_specs)
        # Endpoints recorded, and the day has at least one overnight stop.
        assert day.start_point_id is not None
        assert day.end_point_id is not None
        assert any(point.type == PointType.STOP for point in points)

        # The day's points form a single chain: exactly one head (referenced by
        # nobody) and one tail (no next), the rest linked through next_id.
        ids = {point.id for point in points}
        referenced = {point.next_id for point in points if point.next_id is not None}
        assert referenced <= ids  # chain never points outside the day
        heads = ids - referenced
        tails = {point.id for point in points if point.next_id is None}
        assert len(heads) == 1
        assert len(tails) == 1


def test_seed_is_idempotent(app):
    seed_demo_itinerary()
    seed_demo_itinerary()

    count = (
        db.session.query(Itinerary)
        .filter(Itinerary.user_id.is_(None), Itinerary.name == DEMO_ITINERARY_NAME)
        .count()
    )
    assert count == 1
