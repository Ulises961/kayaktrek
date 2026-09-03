"""M7c §3 — public route library & discovery.

The /explore endpoint becomes filterable + paginated. Discovery facets (duration,
region/bbox, season) are derived on the fly from the route's own days/points — never
from the private Trip — and fork attribution (created_from_id → author) is surfaced.
Itineraries are built directly via the model layer for precise control over point
coordinates, day dates, and the fork link.
"""
from datetime import date

import pytest

from Api.database import db
from Models.day import Day
from Models.itinerary import Itinerary
from Models.point import Point
from Resources.itinerary_resource import ITINERARY_ENDPOINT
from Services.Utils.geo_utils import haversine_nm
from Services.Utils.seasons import season_months, season_of

EXPLORE = f"{ITINERARY_ENDPOINT}/explore"

# A point inside the western Mediterranean (northern hemisphere).
MED = (43.0, 8.0)
# A point off Sydney (southern hemisphere).
SYDNEY = (-33.8, 151.2)
# Second endpoints for a short (~6 nm) and long (~54 nm) two-point route from MED —
# total_miles is derived from real point geometry (see compute_total_miles), so
# distance-facet tests need genuine coordinates, not a fabricated column value.
MED_SHORT_END = (43.1, 8.0)
MED_LONG_END = (43.9, 8.0)


@pytest.fixture
def make_itinerary(app, user_1):
    """Factory building a public itinerary with days+points straight in the DB.

    days_spec: list of (day_number, date|None, [(lat, lng), ...]).
    Returns the persisted Itinerary. All created rows are torn down afterwards.
    """
    created: list[Itinerary] = []

    def _make(
        name,
        days_spec,
        *,
        owner=None,
        is_public=True,
        created_from_id=None,
    ):
        itinerary = Itinerary(
            name=name,
            is_public=is_public,
            user_id=(owner or user_1).id,
            created_from_id=created_from_id,
        )
        db.session.add(itinerary)
        db.session.flush()
        prev_point = None
        for day_number, day_date, coords in days_spec:
            day = Day(
                day_number=day_number,
                itinerary_id=itinerary.id,
                date=day_date,
            )
            db.session.add(day)
            db.session.flush()
            for lat, lng in coords:
                point = Point(latitude=lat, longitude=lng, day_id=day.id)
                db.session.add(point)
                db.session.flush()
                # Chain points into one continuous route (real routes are a single
                # linked list) so distance-facet tests get a genuine computed mileage.
                if prev_point is not None:
                    prev_point.next_id = point.id
                prev_point = point
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
        db.session.query(Itinerary).filter_by(id=itinerary.id).delete(
            synchronize_session=False
        )
    db.session.commit()


def _items(response):
    return response.json["items"]


def _ids(response):
    return [item["id"] for item in _items(response)]


# ── envelope + pagination ─────────────────────────────────────────────────────

def test_explore_unauthenticated_returns_envelope(client, make_itinerary):
    route = make_itinerary("Aegean loop", [(1, date(2024, 7, 1), [MED])])
    r = client.get(EXPLORE)
    assert r.status_code == 200
    assert set(r.json) == {"items", "total", "page", "pages"}
    assert str(route.id) in _ids(r)


def test_pagination_splits_pages(client, make_itinerary):
    for n in range(3):
        make_itinerary(f"Route {n}", [(1, None, [MED])])
    r = client.get(f"{EXPLORE}?per_page=1")
    assert r.status_code == 200
    assert len(_items(r)) == 1
    assert r.json["total"] >= 3
    assert r.json["pages"] >= 3


def test_per_page_capped_at_100(client, make_itinerary):
    make_itinerary("Solo", [(1, None, [MED])])
    r = client.get(f"{EXPLORE}?per_page=500")
    assert r.status_code == 200
    assert len(_items(r)) <= 100


# ── bbox / region ─────────────────────────────────────────────────────────────

def test_bbox_includes_inside_excludes_outside(client, make_itinerary):
    inside = make_itinerary("Med route", [(1, None, [MED])])
    outside = make_itinerary("Sydney route", [(1, None, [SYDNEY])])
    r = client.get(f"{EXPLORE}?minLat=40&maxLat=45&minLng=5&maxLng=12")
    ids = _ids(r)
    assert str(inside.id) in ids
    assert str(outside.id) not in ids


def test_partial_bbox_is_ignored(client, make_itinerary):
    inside = make_itinerary("Med route", [(1, None, [MED])])
    outside = make_itinerary("Sydney route", [(1, None, [SYDNEY])])
    r = client.get(f"{EXPLORE}?minLat=40")  # only one bound → ignored
    ids = _ids(r)
    assert str(inside.id) in ids
    assert str(outside.id) in ids


# ── season ────────────────────────────────────────────────────────────────────

def test_season_northern_summer_matches_july(client, make_itinerary):
    summer = make_itinerary("July paddle", [(1, date(2024, 7, 15), [MED])])
    winter = make_itinerary("January paddle", [(1, date(2024, 1, 15), [MED])])
    r = client.get(f"{EXPLORE}?season=summer")
    ids = _ids(r)
    assert str(summer.id) in ids
    assert str(winter.id) not in ids


def test_season_southern_hemisphere_inverts(client, make_itinerary):
    # December below the equator is summer.
    south_summer = make_itinerary("Sydney December", [(1, date(2024, 12, 20), [SYDNEY])])
    r = client.get(f"{EXPLORE}?season=summer")
    assert str(south_summer.id) in _ids(r)


def test_undated_route_appears_unfiltered_and_under_season_filter(client, make_itinerary):
    undated = make_itinerary("No dates yet", [(1, None, [MED])])
    assert str(undated.id) in _ids(client.get(EXPLORE))
    # Unknown season is a wildcard — still shown when a season filter is active.
    assert str(undated.id) in _ids(client.get(f"{EXPLORE}?season=winter"))


# ── distance / duration ───────────────────────────────────────────────────────

def test_distance_range_inclusive(client, make_itinerary):
    short_nm = haversine_nm(*MED, *MED_SHORT_END)
    long_nm = haversine_nm(*MED, *MED_LONG_END)
    assert 5 <= short_nm <= 10
    assert long_nm > 10
    short = make_itinerary("Short", [(1, None, [MED, MED_SHORT_END])])
    long = make_itinerary("Long", [(1, None, [MED, MED_LONG_END])])
    r = client.get(f"{EXPLORE}?minMiles=5&maxMiles=10")
    ids = _ids(r)
    assert str(short.id) in ids
    assert str(long.id) not in ids


def test_duration_range_counts_numbered_days_only(client, make_itinerary):
    # Day 0 is staging and must not count toward duration.
    two_day = make_itinerary(
        "Two days",
        [(0, None, [MED]), (1, None, [MED]), (2, None, [MED])],
    )
    four_day = make_itinerary(
        "Four days",
        [(n, None, [MED]) for n in range(1, 5)],
    )
    r = client.get(f"{EXPLORE}?minDays=2&maxDays=2")
    ids = _ids(r)
    assert str(two_day.id) in ids
    assert str(four_day.id) not in ids


# ── name search ───────────────────────────────────────────────────────────────

def test_name_search_is_case_insensitive(client, make_itinerary):
    match = make_itinerary("Hebrides Crossing", [(1, None, [MED])])
    other = make_itinerary("Adriatic Run", [(1, None, [MED])])
    r = client.get(f"{EXPLORE}?name=hebrides")
    ids = _ids(r)
    assert str(match.id) in ids
    assert str(other.id) not in ids


# ── fork attribution ──────────────────────────────────────────────────────────

def test_fork_attribution_in_explore_and_detail(client, make_itinerary, user_1):
    source = make_itinerary("Original route", [(1, None, [MED])])
    fork = make_itinerary(
        "My copy", [(1, None, [MED])], created_from_id=source.id
    )
    user_1.profile_is_public = True
    db.session.commit()

    item = next(i for i in _items(client.get(EXPLORE)) if i["id"] == str(fork.id))
    assert item["createdFromId"] == str(source.id)
    assert item["originalAuthor"]["username"] == user_1.username
    assert item["originalAuthor"]["linkable"] is True

    detail = client.get(f"{ITINERARY_ENDPOINT}/{fork.id}/public").json
    assert detail["originalAuthor"]["username"] == user_1.username

    user_1.profile_is_public = False
    db.session.commit()


def test_fork_attribution_linkable_false_for_private_author(client, make_itinerary, user_1):
    source = make_itinerary("Original", [(1, None, [MED])])
    fork = make_itinerary("Copy", [(1, None, [MED])], created_from_id=source.id)
    user_1.profile_is_public = False
    db.session.commit()
    item = next(i for i in _items(client.get(EXPLORE)) if i["id"] == str(fork.id))
    assert item["originalAuthor"]["linkable"] is False


def test_non_fork_has_no_original_author(client, make_itinerary):
    route = make_itinerary("Fresh route", [(1, None, [MED])])
    item = next(i for i in _items(client.get(EXPLORE)) if i["id"] == str(route.id))
    assert item["createdFromId"] is None
    assert item["originalAuthor"] is None


# ── privacy ───────────────────────────────────────────────────────────────────

def test_private_itinerary_never_appears(client, make_itinerary):
    private = make_itinerary("Secret", [(1, None, [MED])], is_public=False)
    assert str(private.id) not in _ids(client.get(EXPLORE))


def test_explore_item_carries_no_trip_data(client, make_itinerary):
    make_itinerary("Public", [(1, date(2024, 7, 1), [MED])])
    item = _items(client.get(EXPLORE))[0]
    assert "tripId" not in item
    assert "userId" not in item
    # `description` and `difficulty` (M19 §1) are Itinerary's own columns, not reads
    # through to the Trip's two same-named fields — see the leak guard in
    # Tests/76_m19_itinerary_content_test.py, which asserts a trip's grade never
    # reaches this row.
    assert set(item) <= {
        "id", "name", "description", "difficulty", "totalMiles", "dayCount", "season",
        "centroidLat", "centroidLng", "createdFromId", "originalAuthor",
        "previewPositions",
        # M23 §3 — each derived from the itinerary's own points, places, photos or owner.
        # `author` is reached via Itinerary.user_id and carries only the projection
        # `originalAuthor` already exposed (username, name, linkable); the raw `userId`
        # stays off the row, which is what the assertion above pins.
        "author", "longestDayMiles", "pointCount", "placeCount", "photoCount",
    }


# ── preview geometry (M12 phase 9b) ──────────────────────────────────────────

def test_explore_item_carries_preview_positions_in_route_order(client, make_itinerary):
    # Two days walked in day order — the thumbnail polyline must follow the
    # route, not point-insertion or UUID order. The dogleg (non-collinear
    # middle point) must survive simplification.
    dogleg = (43.1, 8.4)
    route = make_itinerary(
        "Preview route",
        [
            (1, None, [MED, dogleg]),
            (2, None, [MED_LONG_END]),
        ],
    )
    item = next(i for i in _items(client.get(EXPLORE)) if i["id"] == str(route.id))
    assert item["previewPositions"] == [
        [MED[0], MED[1]],
        [dogleg[0], dogleg[1]],
        [MED_LONG_END[0], MED_LONG_END[1]],
    ]


def test_preview_positions_simplified_and_capped(client, make_itinerary):
    # A dense straight line collapses to its two endpoints under RDP — the
    # listing payload never carries every raw point.
    dense = [(43.0 + n * 0.0001, 8.0) for n in range(200)]
    route = make_itinerary("Dense route", [(1, None, dense)])
    item = next(i for i in _items(client.get(EXPLORE)) if i["id"] == str(route.id))
    positions = item["previewPositions"]
    assert positions[0] == [43.0, 8.0]
    assert positions[-1] == [pytest.approx(43.0199, abs=1e-6), 8.0]
    assert len(positions) <= 60


# ── sort ──────────────────────────────────────────────────────────────────────

def test_sort_by_distance_ascending(client, make_itinerary):
    # Scoped by a shared name prefix so this ordering check is immune to any other
    # public itinerary in the worker's schema (e.g. the ownerless demo seed from
    # Api.seed.seed_demo_itinerary, which persists for the whole test session and
    # would otherwise contend for the unfiltered listing's page-1 slots).
    far = make_itinerary("SortDist Far", [(1, None, [MED, MED_LONG_END])])
    near = make_itinerary("SortDist Near", [(1, None, [MED, MED_SHORT_END])])
    r = client.get(f"{EXPLORE}?sort=distance&name=SortDist")
    ids = _ids(r)
    assert ids.index(str(near.id)) < ids.index(str(far.id))


def test_sort_by_name(client, make_itinerary):
    # Same isolation concern as test_sort_by_distance_ascending above.
    zed = make_itinerary("SortName Zed route", [(1, None, [MED])])
    alpha = make_itinerary("SortName Alpha route", [(1, None, [MED])])
    r = client.get(f"{EXPLORE}?sort=name&name=SortName")
    ids = _ids(r)
    assert ids.index(str(alpha.id)) < ids.index(str(zed.id))


# ── season helper (pure) ──────────────────────────────────────────────────────

def test_season_months_hemisphere_flip():
    assert season_months(["summer"], 45) == {6, 7, 8}
    assert season_months(["summer"], -33) == {12, 1, 2}
    assert season_months(["summer", "winter"], 45) == {6, 7, 8, 12, 1, 2}
    assert season_months(["bogus"], 45) == set()
    assert season_months([], 45) == set()


def test_season_of_inverse():
    assert season_of(7, 45) == "summer"
    assert season_of(7, -33) == "winter"
    assert season_of(1, 45) == "winter"
    assert season_of(1, -33) == "summer"
