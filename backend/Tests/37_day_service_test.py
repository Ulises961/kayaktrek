"""Service-level tests for DayService — covers the branches the HTTP-layer
tests in 02_day_resource_test.py do not reach: assign_points linked-list walk,
the weather/sea update-vs-create-vs-remove paths, and not-found guards.
"""
import uuid
from datetime import date, time

import pytest
from sqlalchemy.exc import NoResultFound

from Api.database import db
from Models.day import Day
from Models.point import Point, PointType
from Models.sea import Sea
from Models.weather import Weather
from Resources.itinerary_resource import ITINERARY_ENDPOINT
from Resources.point_resource import POINT_ENDPOINT
from Resources.trip_resource import TRIP_ENDPOINT
from Services.day_service import DayService

_FAKE_UUID = "00000000-0000-7000-8000-0000000000aa"


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture(scope="function")
def itinerary_with_days(client, auth_headers):
    """Trip + itinerary with a day 0 (staging) and a fresh empty target day."""
    trip_resp = client.post(f"{TRIP_ENDPOINT}/create", json={"inventory": {}}, headers=auth_headers)
    assert trip_resp.status_code == 201
    trip_id = trip_resp.json["id"]

    itin_resp = client.post(
        f"{ITINERARY_ENDPOINT}/create",
        json={"name": "Day Service Route", "tripId": trip_id},
        headers=auth_headers,
    )
    assert itin_resp.status_code == 201
    itin_data = itin_resp.json
    itin_id = itin_data["id"]
    day0_id = next(d["id"] for d in itin_data["days"] if d["dayNumber"] == 0)

    # A target day (day_number 1) the points will be assigned to.
    target_day = Day(day_number=1, itinerary_id=uuid.UUID(itin_id))
    db.session.add(target_day)
    db.session.commit()
    db.session.refresh(target_day)
    target_id = str(target_day.id)

    yield {"itinerary_id": itin_id, "trip_id": trip_id,
           "day0_id": day0_id, "target_day_id": target_id}

    try:
        client.delete(f"{ITINERARY_ENDPOINT}/{itin_id}", headers=auth_headers)
    except Exception:
        pass
    try:
        client.delete(f"{TRIP_ENDPOINT}/{trip_id}", headers=auth_headers)
    except Exception:
        pass


def _make_point(day_id, next_id=None, lat=44.0, lng=8.5):
    point = Point(
        latitude=lat, longitude=lng, type=PointType.POSITION,
        day_id=uuid.UUID(day_id), next_id=next_id,
    )
    db.session.add(point)
    db.session.commit()
    db.session.refresh(point)
    return point


# ── get_day_by_id / get_by_ids ────────────────────────────────────────────────

def test_get_day_by_id_not_found_raises(client, auth_headers):
    with pytest.raises(NoResultFound):
        DayService.get_day_by_id(_FAKE_UUID)


def test_get_by_ids_returns_matching_days(itinerary_with_days):
    day_id = itinerary_with_days["target_day_id"]
    days = DayService.get_by_ids([day_id])
    assert [str(d.id) for d in days] == [day_id]


# ── assign_points ─────────────────────────────────────────────────────────────

def test_assign_points_happy_path_reassigns_whole_chain(itinerary_with_days):
    day0 = itinerary_with_days["day0_id"]
    target = itinerary_with_days["target_day_id"]

    p3 = _make_point(day0)
    p2 = _make_point(day0, next_id=p3.id)
    p1 = _make_point(day0, next_id=p2.id)

    DayService.assign_points(target, str(p1.id), str(p3.id))

    for pid in (p1.id, p2.id, p3.id):
        assert str(db.session.get(Point, pid).day_id) == target


def test_assign_points_day_not_found_raises(itinerary_with_days):
    with pytest.raises(NoResultFound):
        DayService.assign_points(_FAKE_UUID, _FAKE_UUID, _FAKE_UUID)


def test_assign_points_start_point_not_found_raises(itinerary_with_days):
    target = itinerary_with_days["target_day_id"]
    with pytest.raises(NoResultFound):
        DayService.assign_points(target, _FAKE_UUID, _FAKE_UUID)


def test_assign_points_end_not_reachable_raises(itinerary_with_days):
    day0 = itinerary_with_days["day0_id"]
    target = itinerary_with_days["target_day_id"]

    # p1 -> p2 -> (end). p3 is unrelated, so it is never reached.
    p2 = _make_point(day0)
    p1 = _make_point(day0, next_id=p2.id)
    p3 = _make_point(day0)

    with pytest.raises(ValueError, match="not reachable"):
        DayService.assign_points(target, str(p1.id), str(p3.id))


def test_assign_points_cycle_detected_raises(itinerary_with_days):
    day0 = itinerary_with_days["day0_id"]
    target = itinerary_with_days["target_day_id"]

    p1 = _make_point(day0)
    p2 = _make_point(day0, next_id=p1.id)
    p1.next_id = p2.id  # p1 <-> p2 cycle
    db.session.commit()

    with pytest.raises(ValueError, match="Cycle"):
        DayService.assign_points(target, str(p1.id), _FAKE_UUID)


# ── update_day: scalar fields + not found ─────────────────────────────────────

def test_update_day_not_found_raises(client, auth_headers):
    with pytest.raises(NoResultFound):
        DayService.update_day(_FAKE_UUID, {})


def test_update_day_parses_date_string(itinerary_with_days):
    target = itinerary_with_days["target_day_id"]
    updated = DayService.update_day(target, {"date": "2021-05-05"})
    assert updated.date == date(2021, 5, 5)


# ── _update_weather: create / update / remove ─────────────────────────────────

def test_update_day_weather_create_then_update_then_remove(itinerary_with_days):
    target = itinerary_with_days["target_day_id"]

    # create
    day = DayService.update_day(target, {"weather": {"model": "gfs"}})
    assert day.weather is not None and day.weather.model == "gfs"

    # update existing
    day = DayService.update_day(target, {"weather": {"model": "ecmwf"}})
    assert day.weather.model == "ecmwf"

    # remove (key present, value None)
    day = DayService.update_day(target, {"weather": None})
    assert day.weather is None
    assert db.session.query(Weather).filter_by(day_id=uuid.UUID(target)).first() is None


# ── _update_sea: create / update (with time parse) / remove ───────────────────

def test_update_day_sea_create_then_update_then_remove(itinerary_with_days):
    target = itinerary_with_days["target_day_id"]

    # create with time strings -> parsed to time objects
    day = DayService.update_day(
        target, {"sea": {"moonPhase": "new", "highTide": "06:30", "lowTide": "12:45"}}
    )
    assert day.sea is not None
    assert day.sea.moon_phase == "new"
    assert day.sea.high_tide == time(6, 30)

    # update existing with a time string -> hits the str->time branch
    day = DayService.update_day(target, {"sea": {"moonPhase": "full", "highTide": "07:15"}})
    assert day.sea.moon_phase == "full"
    assert day.sea.high_tide == time(7, 15)

    # remove
    day = DayService.update_day(target, {"sea": None})
    assert day.sea is None
    assert db.session.query(Sea).filter_by(day_id=uuid.UUID(target)).first() is None


# ── delete_day ────────────────────────────────────────────────────────────────

def test_delete_day_not_found_raises(client, auth_headers):
    with pytest.raises(NoResultFound):
        DayService.delete_day(_FAKE_UUID)
