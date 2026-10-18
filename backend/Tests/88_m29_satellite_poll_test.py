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


def _build_trip(user, *, state: TripStateType = TripStateType.HAPPENING) -> UUID:
    today = datetime.now(timezone.utc).date()
    trip = Trip(
        state=state,
        destination=_DESTINATION,
        date_from=today,
        date_to=today + timedelta(days=2),
    )
    _db.session.add(trip)
    _db.session.flush()
    _db.session.add(TripMember(user_id=user.id, trip_id=trip.id, role=MemberRoleType.LEADER))
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
