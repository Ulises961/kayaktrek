"""M7d §3 — public payload additions.

`ItineraryPublicSchema.trip_state` exposes only the parent trip's lifecycle state
(the seam a future M8 live-position feature attaches to) and `PointPublicSchema.
images` exposes only photos the owner explicitly opted public — both flow through
the same `/public/<id>` and `/story/public/<token>` routes M7c/M7d already wired.
"""
import pytest

from Api.database import db
from Models.day import Day
from Models.image import Image
from Models.itinerary import Itinerary
from Models.point import Point
from Models.trip import Trip, TripStateType
from Resources.itinerary_resource import ITINERARY_ENDPOINT


@pytest.fixture
def make_public_itinerary(app, user_1):
    created_itineraries = []
    created_trips = []

    def _make(*, trip_state=None, with_point_images=False):
        trip = None
        trip_id = None
        if trip_state is not None:
            trip = Trip(state=trip_state)
            db.session.add(trip)
            db.session.flush()
            trip_id = trip.id

        itinerary = Itinerary(name="Story route", is_public=True, user_id=user_1.id, trip_id=trip_id)
        db.session.add(itinerary)
        db.session.flush()

        day = Day(day_number=1, itinerary_id=itinerary.id)
        db.session.add(day)
        db.session.flush()

        point = Point(latitude=43.0, longitude=8.0, day_id=day.id)
        db.session.add(point)
        db.session.flush()

        if with_point_images:
            public_image = Image(name="public.jpg", location="http://minio/public.jpg", is_public=True)
            private_image = Image(name="private.jpg", location="http://minio/private.jpg", is_public=False)
            db.session.add_all([public_image, private_image])
            point.images.extend([public_image, private_image])
            db.session.commit()

        db.session.commit()
        created_itineraries.append(itinerary)
        if trip is not None:
            created_trips.append(trip)
        return itinerary

    yield _make

    for itinerary in created_itineraries:
        day_ids = [d.id for d in db.session.query(Day).filter_by(itinerary_id=itinerary.id)]
        if day_ids:
            point_ids = [p.id for p in db.session.query(Point).filter(Point.day_id.in_(day_ids))]
            if point_ids:
                for point in db.session.query(Point).filter(Point.id.in_(point_ids)):
                    point.images.clear()
                db.session.commit()
                db.session.query(Point).filter(Point.id.in_(point_ids)).delete(synchronize_session=False)
            db.session.query(Day).filter_by(itinerary_id=itinerary.id).delete(synchronize_session=False)
        db.session.query(Itinerary).filter_by(id=itinerary.id).delete(synchronize_session=False)
    for trip in created_trips:
        db.session.query(Trip).filter_by(id=trip.id).delete(synchronize_session=False)
    db.session.query(Image).filter(Image.name.in_(["public.jpg", "private.jpg"])).delete(
        synchronize_session=False
    )
    db.session.commit()


def test_trip_state_reflects_parent_trip(client, make_public_itinerary):
    itinerary = make_public_itinerary(trip_state=TripStateType.HAPPENING)
    r = client.get(f"{ITINERARY_ENDPOINT}/{itinerary.id}/public")
    assert r.status_code == 200
    assert r.json["tripState"] == "happening"


def test_trip_state_null_without_a_trip(client, make_public_itinerary):
    itinerary = make_public_itinerary()
    r = client.get(f"{ITINERARY_ENDPOINT}/{itinerary.id}/public")
    assert r.status_code == 200
    assert r.json["tripState"] is None


def test_only_opted_in_images_are_public(client, make_public_itinerary):
    itinerary = make_public_itinerary(with_point_images=True)
    r = client.get(f"{ITINERARY_ENDPOINT}/{itinerary.id}/public")
    assert r.status_code == 200
    point = r.json["days"][0]["points"][0]
    urls = [img["url"] for img in point["images"]]
    assert urls == ["http://minio/public.jpg"]


def test_story_by_token_carries_same_payload_additions(client, make_public_itinerary, auth_headers):
    itinerary = make_public_itinerary(trip_state=TripStateType.PAST, with_point_images=True)
    token = client.post(
        f"{ITINERARY_ENDPOINT}/{itinerary.id}/story-share", headers=auth_headers
    ).json["storyShareToken"]

    r = client.get(f"{ITINERARY_ENDPOINT}/story/public/{token}")
    assert r.status_code == 200
    assert r.json["tripState"] == "past"
    point = r.json["days"][0]["points"][0]
    assert [img["url"] for img in point["images"]] == ["http://minio/public.jpg"]
