"""Unit tests for Services.Utils.point_ordering's mobile-sync helpers
(M9c WP1 item 5): assign_order_keys / chain_from_order_keys, the conversion
between the server's next_id chain and the order-key representation
WatermelonDB carries on the device (docs/mobile/sync-protocol-spec.md §7.2).
"""
import uuid

import pytest

from Api.database import db
from Models.day import Day
from Models.itinerary import Itinerary
from Models.point import Point, PointType
from Models.trip import Trip
from Services.Utils.point_ordering import (
    assign_order_keys,
    chain_from_order_keys,
    chain_in_order,
    walk_linked_list,
)


@pytest.fixture
def three_points(app, user_1):
    with app.app_context():
        trip = Trip()
        db.session.add(trip)
        db.session.flush()

        itin = Itinerary(trip_id=trip.id, user_id=user_1.id)
        db.session.add(itin)
        db.session.flush()

        day = Day(day_number=0, itinerary_id=itin.id)
        db.session.add(day)
        db.session.flush()

        p1 = Point(type=PointType.POSITION, day_id=day.id)
        p2 = Point(type=PointType.POSITION, day_id=day.id)
        p3 = Point(type=PointType.POSITION, day_id=day.id)
        db.session.add_all([p1, p2, p3])
        db.session.flush()
        chain_in_order([p1, p2, p3])
        db.session.commit()

        point_ids = [str(p1.id), str(p2.id), str(p3.id)]
        itin_id = itin.id
        trip_id = trip.id

    yield point_ids

    with app.app_context():
        db.session.query(Point).filter(Point.id.in_([uuid.UUID(pid) for pid in point_ids])).delete(
            synchronize_session=False
        )
        db.session.query(Day).filter_by(itinerary_id=itin_id).delete()
        db.session.query(Itinerary).filter_by(id=itin_id).delete()
        db.session.query(Trip).filter_by(id=trip_id).delete()
        db.session.commit()


def _load(app, point_ids):
    with app.app_context():
        by_id = {str(p.id): p for p in db.session.query(Point).filter(
            Point.id.in_([uuid.UUID(pid) for pid in point_ids])
        ).all()}
        return [by_id[pid] for pid in point_ids]


def test_assign_order_keys_follows_chain_order_and_sorts_lexicographically(app, three_points):
    points = _load(app, three_points)
    with app.app_context():
        db.session.add_all(points)
        assign_order_keys(points)
        db.session.commit()

    refreshed = _load(app, three_points)
    keys = [p.order_key for p in refreshed]
    assert keys == sorted(keys)
    assert len(set(keys)) == 3


def test_chain_from_order_keys_is_the_inverse_of_assign_order_keys(app, three_points):
    points = _load(app, three_points)
    with app.app_context():
        db.session.add_all(points)
        assign_order_keys(points)
        db.session.commit()

    # Shuffle the in-memory list — chain_from_order_keys must not depend on
    # argument order, only on each point's own order_key.
    shuffled_ids = [three_points[1], three_points[2], three_points[0]]
    shuffled = _load(app, shuffled_ids)
    with app.app_context():
        db.session.add_all(shuffled)
        chain_from_order_keys(shuffled)
        db.session.commit()

    refreshed = _load(app, three_points)
    assert walk_linked_list(refreshed) == three_points


def test_chain_from_order_keys_breaks_ties_by_id(app, three_points):
    points = _load(app, three_points)
    with app.app_context():
        db.session.add_all(points)
        for point in points:
            point.order_key = "same"
        chain_from_order_keys(points)
        db.session.commit()

    refreshed = _load(app, three_points)
    assert walk_linked_list(refreshed) == sorted(three_points)


def test_reordering_via_order_keys_matches_set_point_order_semantics(app, three_points):
    """A device reorders locally (new order keys), then pushes — the server
    must reproduce exactly the chain a direct chain_in_order call would."""
    points = _load(app, three_points)
    reversed_ids = list(reversed(three_points))
    reversed_points = _load(app, reversed_ids)

    with app.app_context():
        db.session.add_all(reversed_points)
        assign_order_keys(reversed_points)
        db.session.commit()

    refreshed = _load(app, three_points)
    with app.app_context():
        db.session.add_all(refreshed)
        chain_from_order_keys(refreshed)
        db.session.commit()

    final = _load(app, three_points)
    assert walk_linked_list(final) == reversed_ids
