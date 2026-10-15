"""M36 — a page starts polling from the revision its data was read at, not from "now"."""
from unittest.mock import patch
from uuid import UUID, uuid4

from Resources.itinerary_resource import ITINERARY_ENDPOINT
from Resources.trip_resource import TRIP_ENDPOINT
from Services.trip_change_service import TripChange, TripChangeService


def test_a_trip_read_carries_the_revision_it_was_read_at(client, auth_headers, trip_w_o_itinerary):
    trip_id = trip_w_o_itinerary["id"]
    TripChangeService.publish(UUID(trip_id), [TripChange("trip", UUID(trip_id), "update")])

    response = client.get(f"{TRIP_ENDPOINT}/{trip_id}", headers=auth_headers)

    assert response.status_code == 200
    assert response.json["changeRev"] == TripChangeService.current_revision(trip_id)


def test_the_revision_is_the_one_before_a_later_change(client, auth_headers, trip_w_o_itinerary):
    """A poll from this revision reports a change made after the read; one made before it is
    already in the data."""
    trip_id = trip_w_o_itinerary["id"]
    read = client.get(f"{TRIP_ENDPOINT}/{trip_id}", headers=auth_headers)
    TripChangeService.publish(UUID(trip_id), [TripChange("point", uuid4(), "update")])

    page = TripChangeService.changes_since(trip_id, read.json["changeRev"])

    assert len(page.changes) == 1
    assert page.truncated is False


def test_a_trip_read_still_works_when_the_log_cannot_be_reached(client, auth_headers, trip_w_o_itinerary):
    class _Unreachable:
        def get(self, key):
            raise ConnectionError("redis unreachable")

    with patch("Services.trip_change_service.live_redis", return_value=_Unreachable()):
        response = client.get(f"{TRIP_ENDPOINT}/{trip_w_o_itinerary['id']}", headers=auth_headers)

    assert response.status_code == 200
    assert response.json["changeRev"] is None


def test_a_trips_itinerary_read_carries_the_trips_revision(client, auth_headers, itinerary, trip_w_o_itinerary):
    trip_id = trip_w_o_itinerary["id"]
    TripChangeService.publish(UUID(trip_id), [TripChange("point", uuid4(), "update")])

    response = client.get(f"{ITINERARY_ENDPOINT}/{itinerary['id']}", headers=auth_headers)

    assert response.status_code == 200
    assert response.json["changeRev"] == TripChangeService.current_revision(trip_id)


def test_an_itinerary_with_no_trip_has_no_revision(client, auth_headers):
    created = client.post(
        f"{ITINERARY_ENDPOINT}/create", headers=auth_headers, json={"name": "Solo route", "isPublic": False}
    )
    assert created.status_code == 201

    response = client.get(f"{ITINERARY_ENDPOINT}/{created.json['id']}", headers=auth_headers)

    assert response.status_code == 200
    assert response.json["changeRev"] is None
