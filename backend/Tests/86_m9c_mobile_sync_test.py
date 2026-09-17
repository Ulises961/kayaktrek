"""Tests for the mobile pullChanges/pushChanges endpoints (M9c WP1 item 4):
Resources/mobile_sync_resource.py + Services/mobile_sync_service.py.

Route tables (day, point) are out of scope here — WP1 item 7's dedicated
channel covers those; this file only exercises trip_members,
requirement_contributions, weather and sea.
"""
import json
from uuid import UUID

import pytest

from Api.database import db
from Models.day import Day
from Models.itinerary import Itinerary
from Models.sea import Sea
from Models.sea_state import SeaState
from Models.trip import Trip
from Models.trip_member import MemberRoleType, TripMember
from Models.weather import Weather
from Models.weather_state import WeatherState
from Resources.inventory_resource import INVENTORY_ENDPOINT
from Resources.item_resource import ITEM_ENDPOINT
from Resources.mobile_sync_resource import MOBILE_SYNC_ENDPOINT
from datetime import datetime, time, timedelta, timezone


def _pull(client, headers, trip_id, last_pulled_at=None):
    query = f"?lastPulledAt={last_pulled_at}" if last_pulled_at is not None else ""
    return client.get(f"{MOBILE_SYNC_ENDPOINT}/trip/{trip_id}/pull{query}", headers=headers)


def _push(client, headers, trip_id, changes):
    return client.post(
        f"{MOBILE_SYNC_ENDPOINT}/trip/{trip_id}/push",
        headers=headers,
        json={"changes": changes},
    )


# ── pull: auth / membership ────────────────────────────────────────────────

def test_pull_requires_trip_membership(client, outsider_headers, trip_with_crew):
    trip_id = trip_with_crew["trip"]["id"]
    resp = _pull(client, outsider_headers, trip_id)
    assert resp.status_code == 403


def test_pull_initial_sync_puts_rows_in_created_bucket(client, trip_with_crew):
    trip_id = trip_with_crew["trip"]["id"]
    resp = _pull(client, trip_with_crew["leader_headers"], trip_id)
    assert resp.status_code == 200
    changes = resp.json["changes"]
    assert isinstance(resp.json["timestamp"], int)

    member_rows = changes["trip_members"]["created"]
    assert len(member_rows) == 2  # leader + crew
    assert changes["trip_members"]["updated"] == []
    assert changes["trip_members"]["deleted"] == []
    # Carried so an offline float-plan crew manifest can attribute a vessel/
    # emergency contact to a name, not just an opaque userId (M9c WP6).
    for row in member_rows:
        assert row["userName"]
        assert "userSurname" in row
        assert row["userUsername"]


def test_pull_bumps_trip_last_accessed_at(client, app, trip_with_crew):
    """A pullChanges request is the mobile half of the weather-fetch beat
    tasks' attention gate (docs/adr/features.md §1a, M32) — every pull is a
    real foreground/reconnect event, so it must bump the trip's
    last_accessed_at, not just leave it null forever."""
    trip_id = trip_with_crew["trip"]["id"]

    # Stamped on insert, so age it to prove the pull is what moves it forward.
    aged = datetime.now(timezone.utc) - timedelta(days=3)
    with app.app_context():
        trip = db.session.get(Trip, UUID(trip_id))
        trip.last_accessed_at = aged
        db.session.commit()

    resp = _pull(client, trip_with_crew["leader_headers"], trip_id)
    assert resp.status_code == 200

    with app.app_context():
        trip = db.session.get(Trip, UUID(trip_id))
        assert trip.last_accessed_at > aged


def test_pull_delta_sync_puts_rows_in_updated_bucket(client, app, trip_with_crew):
    """Writes directly via `db.session` (no nested app_context) — the `app`
    fixture already keeps one session-scoped context open for the whole
    suite, which `client` requests reuse. A nested `with app.app_context()`
    opens a *different* session, so the outer session's identity map would
    keep serving `client.get()` a pre-update cached copy of this row (see
    the `category_ids` fixture's own comment on this exact pitfall)."""
    trip_id = trip_with_crew["trip"]["id"]
    first = _pull(client, trip_with_crew["leader_headers"], trip_id)
    cutoff = first.json["timestamp"]

    leader = db.session.query(TripMember).filter_by(
        trip_id=UUID(trip_id), role=MemberRoleType.LEADER
    ).one()
    leader.vessel_make = "Valley"
    db.session.commit()

    second = _pull(client, trip_with_crew["leader_headers"], trip_id, cutoff)
    assert second.status_code == 200
    member_changes = second.json["changes"]["trip_members"]
    assert member_changes["created"] == []
    assert any(row["vesselMake"] == "Valley" for row in member_changes["updated"])


def test_pull_timestamp_is_captured_before_the_queries_run(client, trip_with_crew, monkeypatch):
    """Regression: the returned `timestamp` used to be captured via a fresh
    `datetime.now()` AFTER all six queries ran. A write landing in that
    window (updated between the queries and the stale timestamp) would have
    an `updated` strictly less than the next pull's cutoff — permanently
    invisible to every future `updated > cutoff` filter, not just delayed.
    Capturing the snapshot before any query runs closes that window: this
    test pins the snapshot to the FIRST `datetime.now()` call the service
    makes, not a later one."""
    import Services.mobile_sync_service as sync_module

    real_datetime = sync_module.datetime
    calls = []

    class _SpyDateTime:
        @staticmethod
        def now(tz=None):
            value = real_datetime.now(tz)
            calls.append(value)
            return value

        @staticmethod
        def fromtimestamp(*args, **kwargs):
            return real_datetime.fromtimestamp(*args, **kwargs)

    monkeypatch.setattr(sync_module, "datetime", _SpyDateTime)

    trip_id = trip_with_crew["trip"]["id"]
    resp = _pull(client, trip_with_crew["leader_headers"], trip_id)
    assert resp.status_code == 200
    assert len(calls) >= 1
    assert int(calls[0].timestamp() * 1000) == resp.json["timestamp"]


def test_pull_reports_deleted_trip_member(client, app, trip_with_crew):
    trip_id = trip_with_crew["trip"]["id"]
    first = _pull(client, trip_with_crew["leader_headers"], trip_id)
    cutoff = first.json["timestamp"]

    crew = db.session.query(TripMember).filter_by(
        trip_id=UUID(trip_id), role=MemberRoleType.CREW
    ).one()
    crew_id = str(crew.id)
    db.session.delete(crew)
    db.session.commit()

    second = _pull(client, trip_with_crew["leader_headers"], trip_id, cutoff)
    assert crew_id in second.json["changes"]["trip_members"]["deleted"]


# ── push: trip_members ──────────────────────────────────────────────────────

def test_push_updates_own_trip_member_row(client, app, trip_with_crew):
    trip_id = trip_with_crew["trip"]["id"]
    with app.app_context():
        leader = db.session.query(TripMember).filter_by(
            trip_id=UUID(trip_id), role=MemberRoleType.LEADER
        ).one()
        leader_id = str(leader.id)

    resp = _push(client, trip_with_crew["leader_headers"], trip_id, {
        "trip_members": {"updated": [{"id": leader_id, "vesselMake": "P&H"}]}
    })
    assert resp.status_code == 200

    with app.app_context():
        leader = db.session.get(TripMember, UUID(leader_id))
        assert leader.vessel_make == "P&H"


def test_push_rejects_updating_another_members_row(client, app, trip_with_crew):
    trip_id = trip_with_crew["trip"]["id"]
    with app.app_context():
        crew = db.session.query(TripMember).filter_by(
            trip_id=UUID(trip_id), role=MemberRoleType.CREW
        ).one()
        crew_id = str(crew.id)

    resp = _push(client, trip_with_crew["leader_headers"], trip_id, {
        "trip_members": {"updated": [{"id": crew_id, "vesselMake": "P&H"}]}
    })
    assert resp.status_code == 403


def test_push_rejects_creating_or_deleting_trip_members(client, trip_with_crew):
    trip_id = trip_with_crew["trip"]["id"]
    resp = _push(client, trip_with_crew["leader_headers"], trip_id, {
        "trip_members": {"created": [{"id": "whatever"}]}
    })
    assert resp.status_code == 400


def test_push_rejects_weather_or_sea(client, trip_with_crew):
    trip_id = trip_with_crew["trip"]["id"]
    resp = _push(client, trip_with_crew["leader_headers"], trip_id, {
        "weather": {"updated": [{"id": "whatever"}]}
    })
    assert resp.status_code == 400


# ── push: requirement_contributions ────────────────────────────────────────

def test_push_creates_and_deletes_own_contribution(client, trip_with_crew):
    trip_id = trip_with_crew["trip"]["id"]
    headers = trip_with_crew["leader_headers"]
    inventory_id = trip_with_crew["trip"]["inventory"]["id"]

    req_id = json.loads(
        client.post(
            f"{INVENTORY_ENDPOINT}/{inventory_id}/requirements",
            headers=headers,
            json={"name": "Tow line", "category": "safety"},
        ).data
    )["id"]
    item_id = json.loads(
        client.post(
            f"{ITEM_ENDPOINT}/create",
            headers=headers,
            json={"inventoryId": inventory_id, "name": "line", "category": "travel", "status": "owned"},
        ).data
    )["id"]

    resp = _push(client, headers, trip_id, {
        "requirement_contributions": {"created": [{"requirementId": req_id, "itemId": item_id}]}
    })
    assert resp.status_code == 200

    pull_resp = _pull(client, headers, trip_id)
    contributions = pull_resp.json["changes"]["requirement_contributions"]["created"]
    match = next(c for c in contributions if c["requirementId"] == req_id)

    delete_resp = _push(client, headers, trip_id, {
        "requirement_contributions": {"deleted": [match["id"]]}
    })
    assert delete_resp.status_code == 200

    client.delete(f"{ITEM_ENDPOINT}/{item_id}", headers=headers)


def test_push_rejects_contributing_an_item_owned_by_another_user(client, trip_with_crew):
    """The item a device contributes must belong to the pushing user — otherwise
    it could claim someone else's owned item as its own contribution."""
    trip_id = trip_with_crew["trip"]["id"]
    leader_headers = trip_with_crew["leader_headers"]
    crew_headers = trip_with_crew["crew_headers"]
    inventory_id = trip_with_crew["trip"]["inventory"]["id"]

    req_id = json.loads(
        client.post(
            f"{INVENTORY_ENDPOINT}/{inventory_id}/requirements",
            headers=leader_headers,
            json={"name": "Throw bag", "category": "safety"},
        ).data
    )["id"]
    leaders_item_id = json.loads(
        client.post(
            f"{ITEM_ENDPOINT}/create",
            headers=leader_headers,
            json={"inventoryId": inventory_id, "name": "bag", "category": "travel", "status": "owned"},
        ).data
    )["id"]

    resp = _push(client, crew_headers, trip_id, {
        "requirement_contributions": {"created": [{"requirementId": req_id, "itemId": leaders_item_id}]}
    })
    assert resp.status_code == 400

    client.delete(f"{ITEM_ENDPOINT}/{leaders_item_id}", headers=leader_headers)


def test_push_rejects_contributing_to_a_requirement_on_another_trip(client, trip_with_crew, trip_w_o_itinerary):
    """The requirement a device contributes to must belong to the pushing
    user's own trip — otherwise a device could write into an unrelated trip's
    inventory just by knowing/guessing a requirement id."""
    trip_id = trip_with_crew["trip"]["id"]
    leader_headers = trip_with_crew["leader_headers"]
    inventory_id = trip_with_crew["trip"]["inventory"]["id"]

    own_item_id = json.loads(
        client.post(
            f"{ITEM_ENDPOINT}/create",
            headers=leader_headers,
            json={"inventoryId": inventory_id, "name": "rope", "category": "travel", "status": "owned"},
        ).data
    )["id"]

    foreign_inventory_id = trip_w_o_itinerary["inventory"]["id"]
    foreign_req_id = json.loads(
        client.post(
            f"{INVENTORY_ENDPOINT}/{foreign_inventory_id}/requirements",
            headers=leader_headers,
            json={"name": "Foreign requirement", "category": "safety"},
        ).data
    )["id"]

    resp = _push(client, leader_headers, trip_id, {
        "requirement_contributions": {"created": [{"requirementId": foreign_req_id, "itemId": own_item_id}]}
    })
    assert resp.status_code == 400

    client.delete(f"{INVENTORY_ENDPOINT}/{foreign_inventory_id}/requirements/{foreign_req_id}", headers=leader_headers)
    client.delete(f"{ITEM_ENDPOINT}/{own_item_id}", headers=leader_headers)


def test_push_rejects_deleting_another_members_contribution(client, trip_with_crew):
    trip_id = trip_with_crew["trip"]["id"]
    leader_headers = trip_with_crew["leader_headers"]
    crew_headers = trip_with_crew["crew_headers"]
    inventory_id = trip_with_crew["trip"]["inventory"]["id"]

    req_id = json.loads(
        client.post(
            f"{INVENTORY_ENDPOINT}/{inventory_id}/requirements",
            headers=leader_headers,
            json={"name": "Bilge pump", "category": "safety"},
        ).data
    )["id"]
    item_id = json.loads(
        client.post(
            f"{ITEM_ENDPOINT}/create",
            headers=leader_headers,
            json={"inventoryId": inventory_id, "name": "pump", "category": "travel", "status": "owned"},
        ).data
    )["id"]
    client.post(
        f"{INVENTORY_ENDPOINT}/{inventory_id}/requirements/{req_id}/contribute",
        headers=leader_headers,
        json={"itemId": item_id},
    )
    contributions = json.loads(
        client.get(f"{INVENTORY_ENDPOINT}/{inventory_id}", headers=leader_headers).data
    )["requirements"]
    contribution_id = next(
        r for r in contributions if r["id"] == req_id
    )["contributions"][0]["id"]

    resp = _push(client, crew_headers, trip_id, {
        "requirement_contributions": {"deleted": [contribution_id]}
    })
    assert resp.status_code == 403

    client.delete(f"{INVENTORY_ENDPOINT}/{inventory_id}/requirements/{req_id}/contribute", headers=leader_headers)
    client.delete(f"{ITEM_ENDPOINT}/{item_id}", headers=leader_headers)


# ── pull: weather / sea ─────────────────────────────────────────────────────

@pytest.fixture
def trip_with_weather_and_sea(app, user_1):
    with app.app_context():
        trip = Trip()
        db.session.add(trip)
        db.session.flush()

        member = TripMember(trip_id=trip.id, user_id=user_1.id, role=MemberRoleType.LEADER)
        db.session.add(member)

        itin = Itinerary(trip_id=trip.id, user_id=user_1.id)
        db.session.add(itin)
        db.session.flush()

        day = Day(day_number=1, itinerary_id=itin.id)
        db.session.add(day)
        db.session.flush()

        weather = Weather(day_id=day.id, model="open-meteo")
        db.session.add(weather)
        db.session.flush()
        db.session.add(WeatherState(day_id=day.id, time=time(12, 0), temperature=18.0))

        sea = Sea(day_id=day.id)
        db.session.add(sea)
        db.session.flush()
        db.session.add(SeaState(day_id=day.id, time=time(12, 0), wave_height=1.1))

        db.session.commit()
        trip_id = str(trip.id)
        itin_id = itin.id
        day_id = day.id

    yield trip_id

    with app.app_context():
        db.session.query(WeatherState).filter_by(day_id=day_id).delete()
        db.session.query(SeaState).filter_by(day_id=day_id).delete()
        db.session.query(Weather).filter_by(day_id=day_id).delete()
        db.session.query(Sea).filter_by(day_id=day_id).delete()
        db.session.query(Day).filter_by(id=day_id).delete()
        db.session.query(Itinerary).filter_by(id=itin_id).delete()
        db.session.query(TripMember).filter_by(trip_id=UUID(trip_id)).delete()
        db.session.query(Trip).filter_by(id=UUID(trip_id)).delete()
        db.session.commit()


def test_pull_includes_weather_and_sea_states_with_derived_ids(client, auth_headers, trip_with_weather_and_sea):
    resp = _pull(client, auth_headers, trip_with_weather_and_sea)
    assert resp.status_code == 200
    changes = resp.json["changes"]

    weather_rows = changes["weather"]["created"]
    assert len(weather_rows) == 1
    day_id = weather_rows[0]["dayId"]
    assert weather_rows[0]["id"] == day_id

    weather_state_rows = changes["weather_states"]["created"]
    assert weather_state_rows[0]["id"] == f"{day_id}:12:00:00"

    sea_state_rows = changes["sea_states"]["created"]
    assert sea_state_rows[0]["id"] == f"{day_id}:12:00:00"
