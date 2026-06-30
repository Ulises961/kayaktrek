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
from Services.Utils.seasons import season_months, season_of

EXPLORE = f"{ITINERARY_ENDPOINT}/explore"

# A point inside the western Mediterranean (northern hemisphere).
MED = (43.0, 8.0)
# A point off Sydney (southern hemisphere).
SYDNEY = (-33.8, 151.2)


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
        total_miles=None,
        created_from_id=None,
    ):
        itinerary = Itinerary(
            name=name,
            is_public=is_public,
            total_miles=total_miles,
            user_id=(owner or user_1).id,
            created_from_id=created_from_id,
        )
        db.session.add(itinerary)
        db.session.flush()
        for day_number, day_date, coords in days_spec:
            day = Day(
                day_number=day_number,
                itinerary_id=itinerary.id,
                date=day_date,
            )
            db.session.add(day)
            db.session.flush()
            for lat, lng in coords:
                db.session.add(Point(latitude=lat, longitude=lng, day_id=day.id))
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
    short = make_itinerary("Short", [(1, None, [MED])], total_miles=5)
    long = make_itinerary("Long", [(1, None, [MED])], total_miles=50)
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
    make_itinerary("Public", [(1, date(2024, 7, 1), [MED])], total_miles=12)
    item = _items(client.get(EXPLORE))[0]
    assert "tripId" not in item
    assert "userId" not in item
    assert set(item) <= {
        "id", "name", "totalMiles", "dayCount", "season",
        "centroidLat", "centroidLng", "createdFromId", "originalAuthor",
    }


# ── sort ──────────────────────────────────────────────────────────────────────

def test_sort_by_distance_ascending(client, make_itinerary):
    far = make_itinerary("Far", [(1, None, [MED])], total_miles=40)
    near = make_itinerary("Near", [(1, None, [MED])], total_miles=4)
    r = client.get(f"{EXPLORE}?sort=distance")
    ids = _ids(r)
    assert ids.index(str(near.id)) < ids.index(str(far.id))


def test_sort_by_name(client, make_itinerary):
    zed = make_itinerary("Zed route", [(1, None, [MED])])
    alpha = make_itinerary("Alpha route", [(1, None, [MED])])
    r = client.get(f"{EXPLORE}?sort=name")
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
