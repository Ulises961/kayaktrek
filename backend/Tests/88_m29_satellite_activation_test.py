"""M29: a paddler switches their satellite feed on for a trip, and the trip records it."""
from datetime import datetime, timedelta, timezone
from uuid import UUID

import pytest

from Api.database import db as _db
from Models.satellite_feed import SatelliteFeed
from Models.trip import Trip, TripStateType
from Models.trip_member import MemberRoleType, TripMember
from Services.SatelliteFeeds.types import SatelliteProvider

_DESTINATION = "M29 Satellite Activation Test Cove"


@pytest.fixture(autouse=True)
def _cleanup(app):
    yield
    with app.app_context():
        _db.session.query(SatelliteFeed).delete()
        for trip in _db.session.query(Trip).filter(Trip.destination.like(f"{_DESTINATION}%")).all():
            _db.session.delete(trip)  # cascades trip_members
        _db.session.commit()


def _register_feed(user) -> None:
    _db.session.add(SatelliteFeed(
        user_id=user.id,
        provider=SatelliteProvider.INREACH_MAPSHARE,
        feed_url="https://share.garmin.com/Feed/Share/m29-activation-test",
    ))
    _db.session.commit()


def _build_trip(*members: TripMember, state: TripStateType = TripStateType.HAPPENING) -> UUID:
    today = datetime.now(timezone.utc).date()
    trip = Trip(state=state, destination=_DESTINATION, date_from=today, date_to=today + timedelta(days=2))
    _db.session.add(trip)
    _db.session.flush()
    for member in members:
        member.trip_id = trip.id
        _db.session.add(member)
    _db.session.commit()
    return trip.id


def _member(user, *, sharing: bool = False, left_at: datetime | None = None) -> TripMember:
    return TripMember(
        user_id=user.id,
        role=MemberRoleType.LEADER,
        shares_satellite_position=sharing,
        left_at=left_at,
    )


def _stored(trip_id: UUID, user) -> TripMember:
    _db.session.expire_all()
    return _db.session.query(TripMember).filter_by(trip_id=trip_id, user_id=user.id).one()


def _put(client, headers, trip_id: UUID, body):
    return client.put(
        f"/api/v1/trip/{trip_id}/member/me/satellite-tracking", json=body, headers=headers
    )


class TestSwitchingOn:
    def test_stores_the_switch_and_returns_the_membership(self, app, client, auth_headers, user_1):
        _register_feed(user_1)
        trip_id = _build_trip(_member(user_1))

        response = _put(client, auth_headers, trip_id, {"enabled": True})

        assert response.status_code == 200
        assert response.get_json()["sharesSatellitePosition"] is True
        assert _stored(trip_id, user_1).shares_satellite_position is True

    def test_is_allowed_while_the_trip_is_still_being_planned(self, app, client, auth_headers, user_1):
        _register_feed(user_1)
        trip_id = _build_trip(_member(user_1), state=TripStateType.BUILDING)

        response = _put(client, auth_headers, trip_id, {"enabled": True})

        assert response.status_code == 200
        assert _stored(trip_id, user_1).shares_satellite_position is True

    def test_does_not_mark_the_float_plan_confirmed(self, app, client, auth_headers, user_1):
        _register_feed(user_1)
        trip_id = _build_trip(_member(user_1))

        _put(client, auth_headers, trip_id, {"enabled": True})

        assert _stored(trip_id, user_1).float_plan_confirmed_at is None

    def test_a_new_membership_starts_switched_off(self, app, client, auth_headers, user_1):
        trip_id = _build_trip(_member(user_1))

        response = client.get(f"/api/v1/trip/{trip_id}/member/me", headers=auth_headers)

        assert response.status_code == 200
        assert response.get_json()["sharesSatellitePosition"] is False

    def test_one_members_switch_never_changes_anothers(self, app, client, auth_headers, user_1, user_2):
        _register_feed(user_1)
        trip_id = _build_trip(_member(user_1), _member(user_2))

        _put(client, auth_headers, trip_id, {"enabled": True})

        assert _stored(trip_id, user_1).shares_satellite_position is True
        assert _stored(trip_id, user_2).shares_satellite_position is False


class TestSwitchingOnIsRefused:
    def test_without_a_registered_feed(self, app, client, auth_headers, user_1):
        trip_id = _build_trip(_member(user_1))

        response = _put(client, auth_headers, trip_id, {"enabled": True})

        assert response.status_code == 409
        assert "Register your inReach feed in Settings first." in response.get_data(as_text=True)
        assert _stored(trip_id, user_1).shares_satellite_position is False

    @pytest.mark.parametrize("state", [TripStateType.PAST, TripStateType.ARCHIVED])
    def test_once_the_trip_is_over(self, app, client, auth_headers, user_1, state):
        _register_feed(user_1)
        trip_id = _build_trip(_member(user_1), state=state)

        response = _put(client, auth_headers, trip_id, {"enabled": True})

        assert response.status_code == 409
        assert "This trip is over" in response.get_data(as_text=True)
        assert _stored(trip_id, user_1).shares_satellite_position is False

    def test_after_the_member_has_left(self, app, client, auth_headers, user_1):
        _register_feed(user_1)
        trip_id = _build_trip(_member(user_1, left_at=datetime.now(timezone.utc) - timedelta(hours=1)))

        response = _put(client, auth_headers, trip_id, {"enabled": True})

        assert response.status_code == 409
        assert "You have left this trip" in response.get_data(as_text=True)
        assert _stored(trip_id, user_1).shares_satellite_position is False


class TestSwitchingOff:
    def test_stores_the_switch(self, app, client, auth_headers, user_1):
        _register_feed(user_1)
        trip_id = _build_trip(_member(user_1, sharing=True))

        response = _put(client, auth_headers, trip_id, {"enabled": False})

        assert response.status_code == 200
        assert response.get_json()["sharesSatellitePosition"] is False
        assert _stored(trip_id, user_1).shares_satellite_position is False

    def test_needs_no_registered_feed(self, app, client, auth_headers, user_1):
        # A paddler who removed their feed in Settings must still be able to clear the
        # switch on the trips it was left on for.
        trip_id = _build_trip(_member(user_1, sharing=True))

        response = _put(client, auth_headers, trip_id, {"enabled": False})

        assert response.status_code == 200
        assert _stored(trip_id, user_1).shares_satellite_position is False

    def test_is_accepted_once_the_trip_is_over(self, app, client, auth_headers, user_1):
        trip_id = _build_trip(_member(user_1, sharing=True), state=TripStateType.PAST)

        response = _put(client, auth_headers, trip_id, {"enabled": False})

        assert response.status_code == 200
        assert _stored(trip_id, user_1).shares_satellite_position is False

    def test_is_accepted_after_the_member_has_left(self, app, client, auth_headers, user_1):
        left_at = datetime.now(timezone.utc) - timedelta(hours=1)
        trip_id = _build_trip(_member(user_1, sharing=True, left_at=left_at))

        response = _put(client, auth_headers, trip_id, {"enabled": False})

        assert response.status_code == 200
        assert _stored(trip_id, user_1).shares_satellite_position is False


class TestWhoMayCall:
    def test_a_non_member_gets_404_and_changes_nothing(self, app, client, auth_headers_2, user_1, user_2):
        _register_feed(user_2)
        trip_id = _build_trip(_member(user_1))

        response = _put(client, auth_headers_2, trip_id, {"enabled": True})

        assert response.status_code == 404
        assert _stored(trip_id, user_1).shares_satellite_position is False

    def test_an_unauthenticated_caller_gets_401(self, app, client, user_1):
        trip_id = _build_trip(_member(user_1))

        response = client.put(
            f"/api/v1/trip/{trip_id}/member/me/satellite-tracking", json={"enabled": True}
        )

        assert response.status_code == 401
        assert _stored(trip_id, user_1).shares_satellite_position is False


class TestRequestBody:
    @pytest.mark.parametrize("body", [{}, {"enabled": "maybe"}, {"enabled": None}, [], [True], "true"])
    def test_a_body_without_a_boolean_is_rejected_and_changes_nothing(
        self, app, client, auth_headers, user_1, body
    ):
        _register_feed(user_1)
        trip_id = _build_trip(_member(user_1))

        response = _put(client, auth_headers, trip_id, body)

        assert response.status_code == 422
        assert _stored(trip_id, user_1).shares_satellite_position is False

    def test_a_malformed_trip_id_is_a_client_error_not_a_server_error(self, app, client, auth_headers):
        response = client.put(
            "/api/v1/trip/not-a-uuid/member/me/satellite-tracking",
            json={"enabled": True},
            headers=auth_headers,
        )

        assert 400 <= response.status_code < 500
