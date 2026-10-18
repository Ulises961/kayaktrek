"""M29: the satellite feed poll posts a feed's new positions to the user's live trips."""
from datetime import datetime, timedelta, timezone
from unittest.mock import patch
from uuid import UUID

import pytest

from Api.database import db as _db
from Models.position_ping import PositionPing
from Models.satellite_feed import SatelliteFeed
from Models.trip import Trip, TripStateType
from Models.trip_member import MemberRoleType, TripMember
from Services.SatelliteFeeds.types import SatelliteProvider
from Tasks.satellite_feed_beat_task import poll_satellite_feeds

_DESTINATION = "M29 Satellite Poll Test Cove"
_FETCH = "Tasks.satellite_feed_beat_task._fetch"


@pytest.fixture(autouse=True)
def _cleanup(app):
    yield
    with app.app_context():
        _db.session.query(SatelliteFeed).delete()
        for trip in _db.session.query(Trip).filter(Trip.destination.like(f"{_DESTINATION}%")).all():
            _db.session.delete(trip)  # cascades trip_members and pings
        _db.session.commit()


def _register_feed(user) -> SatelliteFeed:
    feed = SatelliteFeed(
        user_id=user.id,
        provider=SatelliteProvider.INREACH_MAPSHARE,
        feed_url="https://share.garmin.com/Feed/Share/m29-poll-test",
    )
    _db.session.add(feed)
    _db.session.commit()
    return feed


def _build_trip(
    user,
    *,
    state: TripStateType = TripStateType.HAPPENING,
    sharing: bool = True,
    left_at: datetime | None = None,
    suffix: str = "",
) -> UUID:
    today = datetime.now(timezone.utc).date()
    trip = Trip(
        state=state,
        destination=f"{_DESTINATION}{suffix}",
        date_from=today,
        date_to=today + timedelta(days=2),
    )
    _db.session.add(trip)
    _db.session.flush()
    _db.session.add(TripMember(
        user_id=user.id,
        trip_id=trip.id,
        role=MemberRoleType.LEADER,
        shares_satellite_position=sharing,
        left_at=left_at,
    ))
    _db.session.commit()
    return trip.id


def _kml(recorded_at: datetime, *, course: str | None = None, velocity: str | None = None) -> bytes:
    stamp = recorded_at.strftime("%Y-%m-%dT%H:%M:%SZ")
    extra = ""
    if course is not None:
        extra += f'<Data name="Course"><value>{course}</value></Data>'
    if velocity is not None:
        extra += f'<Data name="Velocity"><value>{velocity}</value></Data>'
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark>
  <name>{stamp}</name>
  <ExtendedData><Data name="Time UTC"><value>{stamp}</value></Data>{extra}</ExtendedData>
  <Point><coordinates>-8.123,43.456,12.0</coordinates></Point>
</Placemark></Document></kml>""".encode()


def _poll(kml: bytes) -> None:
    with patch(_FETCH, return_value=kml):
        poll_satellite_feeds.run()


def _pings(trip_id: UUID) -> list[PositionPing]:
    _db.session.expire_all()
    return _db.session.query(PositionPing).filter_by(trip_id=trip_id).all()


def _five_minutes_ago() -> datetime:
    return datetime.now(timezone.utc) - timedelta(minutes=5)


def test_ping_carries_heading_and_speed_from_the_feed(app, user_1):
    _register_feed(user_1)
    trip_id = _build_trip(user_1)

    _poll(_kml(_five_minutes_ago(), course="123.00 ° True", velocity="18.0 km/h"))

    (ping,) = _pings(trip_id)
    assert (ping.lat, ping.lon) == (43.456, -8.123)
    assert ping.heading_deg == 123.0
    assert ping.speed_ms == pytest.approx(5.0)


def test_ping_without_course_or_velocity_is_still_posted(app, user_1):
    _register_feed(user_1)
    trip_id = _build_trip(user_1)

    _poll(_kml(_five_minutes_ago()))

    (ping,) = _pings(trip_id)
    assert ping.heading_deg is None
    assert ping.speed_ms is None


class TestWhichTripsReceiveThePosition:
    def test_a_happening_trip_the_member_switched_on_receives_it(self, app, user_1):
        _register_feed(user_1)
        trip_id = _build_trip(user_1)

        _poll(_kml(_five_minutes_ago()))

        assert len(_pings(trip_id)) == 1

    def test_a_trip_the_member_has_not_switched_on_receives_nothing(self, app, user_1):
        _register_feed(user_1)
        trip_id = _build_trip(user_1, sharing=False)

        _poll(_kml(_five_minutes_ago()))

        assert _pings(trip_id) == []

    @pytest.mark.parametrize("state", [TripStateType.BUILDING, TripStateType.PAST, TripStateType.ARCHIVED])
    def test_a_trip_that_is_not_happening_receives_nothing_even_when_switched_on(self, app, user_1, state):
        _register_feed(user_1)
        trip_id = _build_trip(user_1, state=state)

        _poll(_kml(_five_minutes_ago()))

        assert _pings(trip_id) == []

    def test_a_member_who_has_left_receives_nothing_even_when_switched_on(self, app, user_1):
        _register_feed(user_1)
        trip_id = _build_trip(user_1, left_at=datetime.now(timezone.utc) - timedelta(hours=1))

        _poll(_kml(_five_minutes_ago()))

        assert _pings(trip_id) == []

    def test_clearing_a_departure_made_by_mistake_resumes_the_next_position(self, app, user_1):
        _register_feed(user_1)
        trip_id = _build_trip(user_1, left_at=datetime.now(timezone.utc) - timedelta(hours=1))
        _poll(_kml(_five_minutes_ago() - timedelta(minutes=10)))
        assert _pings(trip_id) == []

        member = _db.session.query(TripMember).filter_by(trip_id=trip_id).one()
        member.left_at = None
        _db.session.commit()
        _poll(_kml(_five_minutes_ago()))

        assert len(_pings(trip_id)) == 1

    def test_leaving_the_trip_stops_the_positions(self, app, user_1):
        _register_feed(user_1)
        trip_id = _build_trip(user_1)
        _poll(_kml(_five_minutes_ago() - timedelta(minutes=10)))
        assert len(_pings(trip_id)) == 1

        _db.session.query(TripMember).filter_by(trip_id=trip_id).delete()
        _db.session.commit()
        _poll(_kml(_five_minutes_ago()))

        assert len(_pings(trip_id)) == 1

    def test_only_the_switched_on_trip_of_two_happening_trips_receives_it(self, app, user_1):
        _register_feed(user_1)
        wanted = _build_trip(user_1, suffix=" A")
        forgotten = _build_trip(user_1, sharing=False, suffix=" B")

        _poll(_kml(_five_minutes_ago()))

        assert len(_pings(wanted)) == 1
        assert _pings(forgotten) == []

    def test_two_switched_on_trips_both_receive_it(self, app, user_1):
        _register_feed(user_1)
        first = _build_trip(user_1, suffix=" A")
        second = _build_trip(user_1, suffix=" B")

        _poll(_kml(_five_minutes_ago()))

        assert len(_pings(first)) == 1
        assert len(_pings(second)) == 1

    def test_another_members_switch_does_not_send_this_users_feed_to_their_trip(self, app, user_1, user_2):
        _register_feed(user_1)
        theirs = _build_trip(user_2)

        _poll(_kml(_five_minutes_ago()))

        assert _pings(theirs) == []

    def test_positions_with_no_receiving_trip_are_not_replayed_when_one_appears(self, app, user_1):
        _register_feed(user_1)
        earlier_point = _kml(_five_minutes_ago() - timedelta(minutes=10))
        _poll(earlier_point)
        trip_id = _build_trip(user_1)

        _poll(earlier_point)

        assert _pings(trip_id) == []
