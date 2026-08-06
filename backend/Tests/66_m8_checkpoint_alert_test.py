"""§7.4 Checkpoint beat task tests."""
from datetime import date, datetime, timedelta, timezone
from unittest.mock import patch

import pytest

from Api.database import db as _db
from Models.day import Day
from Models.itinerary import Itinerary
from Models.logistics import Logistics
from Models.position_ping import PositionPing
from Models.trip import Trip, TripStateType
from Models.trip_member import MemberRoleType, TripMember
from Tasks.checkpoint_beat_task import CHECKPOINT_ALERT_HOURS, check_missed_checkpoints

_DESTINATION = "M8 Checkpoint Test Cove"


def _today_utc() -> date:
    # trip.timezone_name is never set in this file's fixtures (no located points),
    # so check_missed_checkpoints' trip_today() falls back to UTC — date.today()
    # (local) would drift a day off it near local midnight in a non-UTC timezone.
    return datetime.now(timezone.utc).date()


def _build_trip(
    user,
    *,
    paused=False,
    day_today=True,
    shore_email="shore@example.com",
    share_token="tok-123",
    last_alert_at=None,
    destination=_DESTINATION,
):
    itinerary = Itinerary(is_public=False, total_miles=0)
    _db.session.add(itinerary)
    _db.session.flush()

    trip = Trip(
        state=TripStateType.HAPPENING,
        is_paused=paused,
        destination=destination,
        date_from=_today_utc(),
        date_to=_today_utc() + timedelta(days=2),
        last_checkpoint_alert_at=last_alert_at,
    )
    _db.session.add(trip)
    _db.session.flush()

    itinerary.trip_id = trip.id
    if day_today:
        _db.session.add(Day(day_number=1, itinerary_id=itinerary.id, date=_today_utc()))

    _db.session.add(TripMember(
        user_id=user.id,
        trip_id=trip.id,
        role=MemberRoleType.LEADER,
        emergency_contact_name="Jane Doe",
        emergency_contact_phone="+15551234",
        emergency_contact_relationship="Spouse",
    ))

    if shore_email is not None:
        _db.session.add(Logistics(trip_id=trip.id, shore_contact_email=shore_email, share_token=share_token))

    _db.session.commit()
    return trip.id


def _add_ping(trip_id, user, recorded_at):
    _db.session.add(PositionPing(trip_id=trip_id, user_id=user.id, lat=1.0, lon=1.0, recorded_at=recorded_at))
    _db.session.commit()


def _calls_for_our_trip(mock_send, destination=_DESTINATION):
    """Filter mock calls down to this test's own trip — a shared worker schema
    can carry stray `happening` trips left behind by other test files, so
    identifying by our own unique destination keeps assertions immune to that
    rather than relying on a global call count."""
    return [c for c in mock_send.call_args_list if c.kwargs.get("destination") == destination]


@pytest.fixture(autouse=True)
def _cleanup(app):
    yield
    with app.app_context():
        for trip in _db.session.query(Trip).filter(Trip.destination.like(f"{_DESTINATION}%")).all():
            _db.session.delete(trip)  # cascades itinerary/days/trip_members/logistics/pings
        _db.session.commit()


def test_fires_on_stale_ping(app, user_1):
    trip_id = _build_trip(user_1)
    stale = datetime.now(timezone.utc) - timedelta(hours=CHECKPOINT_ALERT_HOURS + 1)
    _add_ping(trip_id, user_1, stale)

    with patch("Tasks.checkpoint_beat_task.send_template_email") as mock_send:
        check_missed_checkpoints.run()

    calls = _calls_for_our_trip(mock_send)
    assert len(calls) == 1
    kwargs = calls[0].kwargs
    assert kwargs["to"] == "shore@example.com"
    assert kwargs["template"] == "missed_checkpoint"
    assert kwargs["checkpoint_name"] == "Day 1"
    # user_1 is a session-scoped fixture shared across test files; other files
    # (e.g. 00_user_resource_test.py) legitimately rename it via a real PATCH,
    # so compare against the same name+surname concatenation the production
    # code uses rather than the first-name column alone.
    expected_name = user_1.name + (f" {user_1.surname}" if user_1.surname else "")
    assert kwargs["crew"][0]["name"] == expected_name
    assert kwargs["crew"][0]["emergencyContact"]["name"] == "Jane Doe"
    assert "tok-123" in kwargs["float_plan_url"]

    trip = _db.session.get(Trip, trip_id)
    assert trip.last_checkpoint_alert_at is not None


def test_skips_paused_trip(app, user_1):
    trip_id = _build_trip(user_1, paused=True)
    stale = datetime.now(timezone.utc) - timedelta(hours=CHECKPOINT_ALERT_HOURS + 1)
    _add_ping(trip_id, user_1, stale)

    with patch("Tasks.checkpoint_beat_task.send_template_email") as mock_send:
        check_missed_checkpoints.run()

    assert _calls_for_our_trip(mock_send) == []


def test_skips_no_day_today(app, user_1):
    trip_id = _build_trip(user_1, day_today=False)
    stale = datetime.now(timezone.utc) - timedelta(hours=CHECKPOINT_ALERT_HOURS + 1)
    _add_ping(trip_id, user_1, stale)

    with patch("Tasks.checkpoint_beat_task.send_template_email") as mock_send:
        check_missed_checkpoints.run()

    assert _calls_for_our_trip(mock_send) == []


def test_skips_no_pings_ever(app, user_1):
    _build_trip(user_1)

    with patch("Tasks.checkpoint_beat_task.send_template_email") as mock_send:
        check_missed_checkpoints.run()

    assert _calls_for_our_trip(mock_send) == []


def test_skips_fresh_ping(app, user_1):
    trip_id = _build_trip(user_1)
    _add_ping(trip_id, user_1, datetime.now(timezone.utc) - timedelta(minutes=5))

    with patch("Tasks.checkpoint_beat_task.send_template_email") as mock_send:
        check_missed_checkpoints.run()

    assert _calls_for_our_trip(mock_send) == []


def test_skips_recently_alerted_trip(app, user_1):
    trip_id = _build_trip(user_1, last_alert_at=datetime.now(timezone.utc) - timedelta(hours=2))
    stale = datetime.now(timezone.utc) - timedelta(hours=CHECKPOINT_ALERT_HOURS + 1)
    _add_ping(trip_id, user_1, stale)

    with patch("Tasks.checkpoint_beat_task.send_template_email") as mock_send:
        check_missed_checkpoints.run()

    assert _calls_for_our_trip(mock_send) == []


def test_missing_shore_email_warns_without_crash(app, user_1):
    trip_id = _build_trip(user_1, shore_email=None)
    stale = datetime.now(timezone.utc) - timedelta(hours=CHECKPOINT_ALERT_HOURS + 1)
    _add_ping(trip_id, user_1, stale)

    with patch("Tasks.checkpoint_beat_task.send_template_email") as mock_send:
        check_missed_checkpoints.run()  # must not raise

    assert _calls_for_our_trip(mock_send) == []


# --- failure path: mail service down (§5 of the rubric — beat tasks run unattended) ---


def test_mail_failure_is_not_swallowed_and_leaves_trip_unmarked_for_retry(app, user_1):
    """A single trip whose alert email fails must not be recorded as alerted —
    otherwise a mail outage would permanently silence its checkpoint alert
    instead of retrying on the next hourly beat tick."""
    trip_id = _build_trip(user_1)
    stale = datetime.now(timezone.utc) - timedelta(hours=CHECKPOINT_ALERT_HOURS + 1)
    _add_ping(trip_id, user_1, stale)

    with patch("Tasks.checkpoint_beat_task.send_template_email") as mock_send:
        mock_send.side_effect = ConnectionError("smtp unreachable")
        check_missed_checkpoints.run()  # the beat task itself must not raise

    trip = _db.session.get(Trip, trip_id)
    assert trip.last_checkpoint_alert_at is None

    # session left usable — a plain query after the failure must not raise
    # PendingRollbackError or similar.
    assert _db.session.query(Trip).filter_by(id=trip_id).count() == 1


def test_mail_failure_for_one_trip_does_not_block_alerts_for_others_in_the_batch(app, user_1):
    """Before the fix, one trip's mail failure aborted the whole task before its
    single end-of-loop commit, so a trip processed earlier in the same run lost
    its alert too even though sending for it had already succeeded."""
    failing_destination = _DESTINATION
    ok_destination = f"{_DESTINATION} B"
    failing_trip_id = _build_trip(user_1, destination=failing_destination, share_token="tok-fail")
    ok_trip_id = _build_trip(user_1, destination=ok_destination, share_token="tok-ok")
    stale = datetime.now(timezone.utc) - timedelta(hours=CHECKPOINT_ALERT_HOURS + 1)
    _add_ping(failing_trip_id, user_1, stale)
    _add_ping(ok_trip_id, user_1, stale)

    def _send(*, destination, **kwargs):
        if destination == failing_destination:
            raise ConnectionError("smtp unreachable")

    with patch("Tasks.checkpoint_beat_task.send_template_email") as mock_send:
        mock_send.side_effect = _send
        check_missed_checkpoints.run()

    assert _calls_for_our_trip(mock_send, ok_destination) != []
    ok_trip = _db.session.get(Trip, ok_trip_id)
    assert ok_trip.last_checkpoint_alert_at is not None

    failing_trip = _db.session.get(Trip, failing_trip_id)
    assert failing_trip.last_checkpoint_alert_at is None
