"""Tests for the mobile pullChanges endpoint (M9c WP1 item 4):
Resources/mobile_sync_resource.py + Services/mobile_sync_service.py.

Route tables (day, point) are out of scope here — WP1 item 7's dedicated
channel covers those; this file only exercises trip_members,
requirement_contributions, weather and sea. Changes made on the phone are
sent through the mutation queue (Tests/90_m9d_mutation_queue_test.py).
"""
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
from Resources.mobile_sync_resource import MOBILE_SYNC_ENDPOINT
from datetime import datetime, time, timedelta, timezone


def _pull(client, headers, trip_id, last_pulled_at=None):
    query = f"?lastPulledAt={last_pulled_at}" if last_pulled_at is not None else ""
    return client.get(f"{MOBILE_SYNC_ENDPOINT}/trip/{trip_id}/pull{query}", headers=headers)


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
