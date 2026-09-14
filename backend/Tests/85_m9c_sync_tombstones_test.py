"""Tests for the ORM after_delete tombstone listeners (M9c WP1 item 1):
Services/Utils/sync_tombstones.py. Deleted rows on synced tables (weather,
sea, trip_member, requirement_contribution) must leave a SyncTombstone behind
so a mobile pull can detect the deletion — absence alone isn't queryable.

Route tables (day, point) are deliberately not covered here — they sync
through their own atomic whole-subtree channel (WP1 item 7), not a
tombstoned delta.
"""
import json
from uuid import UUID

import pytest

from Api.database import db
from Models.day import Day
from Models.itinerary import Itinerary
from Models.sea import Sea
from Models.sync_tombstone import SyncTombstone
from Models.trip import Trip
from Models.trip_member import MemberRoleType, TripMember
from Models.weather import Weather
from Resources.inventory_resource import INVENTORY_ENDPOINT
from Resources.item_resource import ITEM_ENDPOINT
from Services.trip_service import TripService


def _tombstones(trip_id: str, table_name: str):
    return (
        db.session.query(SyncTombstone)
        .filter_by(trip_id=UUID(trip_id), table_name=table_name)
        .all()
    )


# ── requirement_contribution (direct delete, via InventoryService.unclaim) ────

def test_unclaim_requirement_writes_tombstone(client, auth_headers, trip_with_crew):
    trip_id = trip_with_crew["trip"]["id"]
    inventory_id = trip_with_crew["trip"]["inventory"]["id"]

    req_id = json.loads(
        client.post(
            f"{INVENTORY_ENDPOINT}/{inventory_id}/requirements",
            headers=auth_headers,
            json={"name": "First Aid Kit", "category": "first_aid"},
        ).data
    )["id"]
    item_id = json.loads(
        client.post(
            f"{ITEM_ENDPOINT}/create",
            headers=auth_headers,
            json={"inventoryId": inventory_id, "name": "paddle", "category": "travel", "status": "owned"},
        ).data
    )["id"]

    contribution_id = json.loads(
        client.post(
            f"{INVENTORY_ENDPOINT}/{inventory_id}/requirements/{req_id}/contribute",
            headers=auth_headers,
            json={"itemId": item_id},
        ).data
    )["contributions"][0]["id"]

    before = _tombstones(trip_id, "requirement_contribution")

    resp = client.delete(
        f"{INVENTORY_ENDPOINT}/{inventory_id}/requirements/{req_id}/contribute",
        headers=auth_headers,
    )
    assert resp.status_code == 200

    after = _tombstones(trip_id, "requirement_contribution")
    assert len(after) == len(before) + 1
    assert str(after[-1].record_id) == contribution_id

    client.delete(f"{ITEM_ENDPOINT}/{item_id}", headers=auth_headers)


# ── requirement_contribution (cascade, via TripRequirement removal) ───────────

def test_removing_requirement_cascades_a_contribution_tombstone(client, auth_headers, trip_with_crew):
    trip_id = trip_with_crew["trip"]["id"]
    inventory_id = trip_with_crew["trip"]["inventory"]["id"]

    req_id = json.loads(
        client.post(
            f"{INVENTORY_ENDPOINT}/{inventory_id}/requirements",
            headers=auth_headers,
            json={"name": "Spare Paddle", "category": "safety"},
        ).data
    )["id"]
    item_id = json.loads(
        client.post(
            f"{ITEM_ENDPOINT}/create",
            headers=auth_headers,
            json={"inventoryId": inventory_id, "name": "paddle 2", "category": "travel", "status": "owned"},
        ).data
    )["id"]
    contribution_id = json.loads(
        client.post(
            f"{INVENTORY_ENDPOINT}/{inventory_id}/requirements/{req_id}/contribute",
            headers=auth_headers,
            json={"itemId": item_id},
        ).data
    )["contributions"][0]["id"]

    before = _tombstones(trip_id, "requirement_contribution")

    resp = client.delete(f"{INVENTORY_ENDPOINT}/{inventory_id}/requirements/{req_id}", headers=auth_headers)
    assert resp.status_code == 200

    after = _tombstones(trip_id, "requirement_contribution")
    assert len(after) == len(before) + 1
    assert str(after[-1].record_id) == contribution_id

    client.delete(f"{ITEM_ENDPOINT}/{item_id}", headers=auth_headers)


# ── trip_member (direct delete, via TripService.remove_member) ────────────────

def test_remove_member_writes_tombstone(app, trip_with_crew):
    trip_id = trip_with_crew["trip"]["id"]

    with app.app_context():
        crew = (
            db.session.query(TripMember)
            .filter_by(trip_id=UUID(trip_id), role=MemberRoleType.CREW)
            .one()
        )
        crew_id = crew.id
        crew_user_id = crew.user_id

        before = _tombstones(trip_id, "trip_member")

        TripService.remove_member(trip_id, str(crew_user_id))
        db.session.commit()

        after = _tombstones(trip_id, "trip_member")
        assert len(after) == len(before) + 1
        assert after[-1].record_id == crew_id


# ── weather / sea (cascade, via Day deletion) ──────────────────────────────────

@pytest.fixture
def day_with_weather_and_sea(app, user_1):
    with app.app_context():
        trip = Trip()
        db.session.add(trip)
        db.session.flush()

        itin = Itinerary(trip_id=trip.id, user_id=user_1.id)
        db.session.add(itin)
        db.session.flush()

        day = Day(day_number=1, itinerary_id=itin.id)
        db.session.add(day)
        db.session.flush()

        weather = Weather(day_id=day.id, model="open-meteo")
        sea = Sea(day_id=day.id)
        db.session.add_all([weather, sea])
        db.session.commit()

        day_id = day.id
        trip_id = str(trip.id)

    yield {"day_id": day_id, "trip_id": trip_id}

    with app.app_context():
        db.session.query(Day).filter_by(id=day_id).delete()
        db.session.query(Itinerary).filter_by(trip_id=UUID(trip_id)).delete()
        db.session.query(Trip).filter_by(id=UUID(trip_id)).delete()
        db.session.commit()


def test_deleting_a_day_tombstones_its_weather_and_sea(app, day_with_weather_and_sea):
    day_id = day_with_weather_and_sea["day_id"]
    trip_id = day_with_weather_and_sea["trip_id"]

    with app.app_context():
        weather_before = _tombstones(trip_id, "weather")
        sea_before = _tombstones(trip_id, "sea")

        day = db.session.get(Day, day_id)
        db.session.delete(day)
        db.session.commit()

        weather_after = _tombstones(trip_id, "weather")
        sea_after = _tombstones(trip_id, "sea")

    assert len(weather_after) == len(weather_before) + 1
    assert weather_after[-1].record_id == day_id
    assert len(sea_after) == len(sea_before) + 1
    assert sea_after[-1].record_id == day_id
