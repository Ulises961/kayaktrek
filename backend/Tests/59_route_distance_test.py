"""compute_total_miles — cross-day ordering regression.

Each day's points form their own linked-list chain; day chains are disconnected.
The 2026-07-10 bug: a single global walk ordered the disconnected heads by
UUIDv7 string, and points created in the same millisecond tie on the timestamp
prefix — so a later day's head could sort first, walking the route out of order
and inflating the derived distance. The walk must be per-day, in day_number
order.
"""

from types import SimpleNamespace

import pytest

from Services.Utils.geo_utils import haversine_nm
from Services.Utils.route_distance import compute_total_miles


def _point(pid, lat, lon, next_id=None):
    return SimpleNamespace(id=pid, next_id=next_id, latitude=lat, longitude=lon)


LAUNCH = (48.4, -123.35)
WAYPOINT = (48.45, -123.3)
CAMP = (48.5, -123.25)


def _expected_total():
    return haversine_nm(*LAUNCH, *WAYPOINT) + haversine_nm(*WAYPOINT, *CAMP)


def test_cross_day_total_follows_day_number_not_head_id_order():
    # Day 2's single point gets the lexicographically SMALLEST id ("a…"): the
    # old global head sort walked it first (Camp → Launch → Waypoint ≈ 10.8 nm
    # for this geometry instead of the true ≈ 7.2 nm).
    day1 = SimpleNamespace(
        day_number=1,
        points=[
            _point("b-launch", *LAUNCH, next_id="c-waypoint"),
            _point("c-waypoint", *WAYPOINT),
        ],
    )
    day2 = SimpleNamespace(day_number=2, points=[_point("a-camp", *CAMP)])

    # Relationship order is not guaranteed either — hand the days over reversed.
    total = compute_total_miles([day2, day1])

    assert total == pytest.approx(_expected_total(), rel=1e-6)


def test_staging_day_zero_is_excluded():
    staging = SimpleNamespace(day_number=0, points=[_point("z-staging", 0.0, 0.0)])
    day1 = SimpleNamespace(
        day_number=1,
        points=[
            _point("a-launch", *LAUNCH, next_id="b-waypoint"),
            _point("b-waypoint", *WAYPOINT),
        ],
    )

    total = compute_total_miles([staging, day1])

    assert total == pytest.approx(haversine_nm(*LAUNCH, *WAYPOINT), rel=1e-6)


def test_unplaced_points_are_skipped():
    day1 = SimpleNamespace(
        day_number=1,
        points=[
            _point("a-launch", *LAUNCH, next_id="b-unplaced"),
            _point("b-unplaced", None, None, next_id="c-waypoint"),
            _point("c-waypoint", *WAYPOINT),
        ],
    )

    total = compute_total_miles([day1])

    assert total == pytest.approx(haversine_nm(*LAUNCH, *WAYPOINT), rel=1e-6)


def test_empty_and_pointless_days_are_zero():
    assert compute_total_miles([]) == 0.0
    assert compute_total_miles([SimpleNamespace(day_number=1, points=[])]) == 0.0
