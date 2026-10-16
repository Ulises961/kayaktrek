"""Lookups that used to sit inside a resource and now belong to their services."""
from uuid import uuid4

import pytest
from sqlalchemy.exc import NoResultFound

from Api.database import db as _db
from Models.user import User
from Services.auth_service import AuthService
from Services.trip_service import TripService


@pytest.fixture
def unactivated_user(app, client):
    mail = f"activate.{uuid4().hex[:8]}@example.com"
    response = client.post("/api/v1/auth/register", json={
        "mail": mail, "pwd": "Activate9$", "name": "Activate", "username": f"activate_{uuid4().hex[:8]}",
    })
    assert response.status_code == 201
    with app.app_context():
        user = _db.session.query(User).filter_by(mail=mail).one()
        assert user.active is False
        user_id = user.id
    yield mail
    with app.app_context():
        user = _db.session.get(User, user_id)
        if user:
            _db.session.delete(user)
            _db.session.commit()


def test_activating_by_mail_ignores_case_and_surrounding_space(app, unactivated_user):
    with app.app_context():
        returned = AuthService.activate_by_mail(f"  {unactivated_user.upper()}  ")

        assert returned.active is True
        _db.session.expire_all()
        assert _db.session.query(User).filter_by(mail=unactivated_user).one().active is True


def test_activating_an_unknown_address_raises_not_found(app):
    with app.app_context():
        with pytest.raises(NoResultFound):
            AuthService.activate_by_mail(f"nobody.{uuid4().hex}@example.com")


@pytest.mark.parametrize("trip_id", ["not-a-uuid", "", "00000000-0000-4000-8000-000000000000"])
def test_a_trip_that_is_not_there_is_not_happening(app, trip_id):
    """A malformed id, an empty one and a well-formed id that matches nothing give the same
    answer, so a caller cannot tell a missing trip from one that has not started."""
    with app.app_context():
        assert TripService.find_happening_trip(trip_id) is None


def test_a_trip_still_being_planned_is_not_happening(app, client, auth_headers):
    created = client.post(
        "/api/v1/trip/create",
        json={"inventory": {}, "itinerary": {"isPublic": False, "totalMiles": 0, "days": []}},
        headers=auth_headers,
    )
    assert created.status_code == 201
    trip_id = created.get_json()["id"]

    with app.app_context():
        assert TripService.find_happening_trip(trip_id) is None
        _db.session.delete(TripService.get_trip_by_id(trip_id))
        _db.session.commit()
