from Resources.itinerary_resource import ITINERARY_ENDPOINT
from Resources.point_resource import POINT_ENDPOINT
from Resources.trip_resource import TRIP_ENDPOINT
from Services.itinerary_service import ItineraryService
from Api.database import db
from Models.day import Day
from Models.point import Point
from uuid import UUID
import json
import types
from datetime import date


def test_update_itinerary(client, auth_headers, itinerary):
    days = [
        {
            "day_number": 1,
            "date": date.fromisoformat('2026-12-31').strftime("%Y-%m-%d"),
            "points": [],
        },
        {
            "day_number": 2,
            "date": date.fromisoformat('2026-01-01').strftime("%Y-%m-%d"),
            "points": [],
        }
    ]

    itinerary = {**itinerary, "days": days, }

    response = client.patch(f"{ITINERARY_ENDPOINT}/{itinerary['id']}", headers=auth_headers, json=itinerary)
    updated_itinerary = json.loads(response.data)

    assert response.status_code == 200
    assert updated_itinerary['days'][0]['dayNumber'] == 1
    assert updated_itinerary['days'][0]['date'] == "2026-12-31"
    assert updated_itinerary['tripId'] == itinerary['tripId']

def test_get_itinerary_by_id(client, auth_headers, itinerary):
    response = client.get(f"{ITINERARY_ENDPOINT}/{itinerary['id']}", headers=auth_headers)
    retrieved_itinerary = json.loads(response.data)
    days = retrieved_itinerary['days']
    day_numbers = {d['dayNumber'] for d in days}

    assert response.status_code == 200
    # Day 0 (staging area) is included in the map builder endpoint
    assert len(days) == 3
    assert 0 in day_numbers
    assert 1 in day_numbers
    assert 2 in day_numbers
    day1 = next(d for d in days if d['dayNumber'] == 1)
    assert day1['date'] == "2020-12-31"

def test_remove_days_from_itinerary(client, auth_headers, itinerary):
    update_data = {"days": [], "tripId": itinerary["tripId"]}

    response = client.patch(f"{ITINERARY_ENDPOINT}/{itinerary['id']}", headers=auth_headers, json=update_data)
    updated_itinerary = json.loads(response.data)

    assert len(updated_itinerary['days']) == 0
    assert updated_itinerary['tripId'] == itinerary['tripId']
    assert response.status_code == 200

def test_delete_itinerary(client, auth_headers, itinerary):
    response = client.delete(f"{ITINERARY_ENDPOINT}/{itinerary['id']}", headers=auth_headers)
    assert response.status_code == 200
    # The delete must actually take effect, not just return 200.
    assert client.get(f"{ITINERARY_ENDPOINT}/{itinerary['id']}", headers=auth_headers).status_code == 404


def test_delete_itinerary_cascades_days_and_points(client, auth_headers, itinerary):
    """The GDPR-motivating cascade (plans/M16-backend-test-quality.md): deleting
    an Itinerary must cascade-delete its Days and its Points cleanly (DB-level
    ondelete=CASCADE down the itinerary -> day -> point chain), not raise a
    ForeignKeyViolation and not leave orphaned rows behind.

    Regression: Day.points had no ORM cascade, so SQLAlchemy's unit-of-work
    NULLed each eager-loaded Point's day_id instead of deleting it — the DB-level
    ondelete=CASCADE on Point.day_id never got a chance to fire. Fixed in
    Models/day.py (points relationship now carries cascade="all, delete").
    """
    day0_id = next(d["id"] for d in itinerary["days"] if d["dayNumber"] == 0)
    p1 = client.post(f"{POINT_ENDPOINT}/create", headers=auth_headers,
                      json={"dayId": day0_id, "type": "position",
                            "latitude": 44.0, "longitude": 8.5}).json
    p2 = client.post(f"{POINT_ENDPOINT}/create", headers=auth_headers,
                      json={"dayId": day0_id, "type": "position",
                            "latitude": 44.1, "longitude": 8.6}).json
    # p1 -> p2 linked-list chain: exercises point.next_id (ON DELETE SET NULL)
    # alongside the day/point CASCADE, so both FK rules fire in the same delete.
    assert client.patch(f"{POINT_ENDPOINT}/{p1['id']}", headers=auth_headers,
                        json={"next": p2}).status_code == 200

    response = client.delete(f"{ITINERARY_ENDPOINT}/{itinerary['id']}", headers=auth_headers)
    assert response.status_code == 200
    assert client.get(f"{ITINERARY_ENDPOINT}/{itinerary['id']}", headers=auth_headers).status_code == 404

    remaining_days = db.session.query(Day).filter_by(itinerary_id=UUID(itinerary['id'])).all()
    assert remaining_days == []
    remaining_points = db.session.query(Point).filter(
        Point.id.in_([UUID(p1['id']), UUID(p2['id'])])
    ).all()
    assert remaining_points == []


def test_apply_boundaries_clears_empty_day(client, auth_headers, itinerary):
    """Days omitted from the payload have their boundary FKs cleared to null."""
    full = client.get(f"{ITINERARY_ENDPOINT}/{itinerary['id']}", headers=auth_headers).json
    days_by_number = {d['dayNumber']: d for d in full['days']}
    day0_id = days_by_number[0]['id']
    day1_id = days_by_number[1]['id']
    day2_id = days_by_number[2]['id']

    p1 = client.post(f"{POINT_ENDPOINT}/create", headers=auth_headers,
                     json={"dayId": day0_id, "type": "stop"}).json
    p2 = client.post(f"{POINT_ENDPOINT}/create", headers=auth_headers,
                     json={"dayId": day0_id, "type": "stop"}).json

    # First apply: give day 2 stale boundaries so we can verify they are cleared.
    pre = client.post(
        f"{ITINERARY_ENDPOINT}/{itinerary['id']}/apply-boundaries",
        headers=auth_headers,
        json={
            "boundaries": [
                {"dayId": day1_id, "startPointId": p1['id'], "endPointId": p1['id'], "date": None},
                {"dayId": day2_id, "startPointId": p2['id'], "endPointId": p2['id'], "date": None},
            ],
            "points": [],
        }
    )
    assert pre.status_code == 200

    # Second apply: day 2 omitted — it is now empty.
    resp = client.post(
        f"{ITINERARY_ENDPOINT}/{itinerary['id']}/apply-boundaries",
        headers=auth_headers,
        json={
            "boundaries": [
                {"dayId": day1_id, "startPointId": p1['id'], "endPointId": p2['id'], "date": None},
            ],
            "points": [],
        }
    )
    assert resp.status_code == 200
    result_days = {d['dayNumber']: d for d in resp.json['days']}
    assert result_days[1]['startPointId'] == p1['id']
    assert result_days[1]['endPointId'] == p2['id']
    assert result_days[2]['startPointId'] is None
    assert result_days[2]['endPointId'] is None


def test_new_point_links_to_global_tail_after_apply(client, auth_headers, itinerary):
    """Points created after apply_boundaries must link to the global chain tail.

    apply_boundaries moves points from day 0 into numbered days.  The original
    tail search is day-scoped, so the first point dropped after an apply finds no
    tail in day 0 and becomes orphaned.  _walk_linked_list then can't reach it,
    causing a 400 on the next apply.
    """
    full = client.get(f"{ITINERARY_ENDPOINT}/{itinerary['id']}", headers=auth_headers).json
    days_by_number = {d['dayNumber']: d for d in full['days']}
    day0_id = days_by_number[0]['id']
    day1_id = days_by_number[1]['id']
    day2_id = days_by_number[2]['id']

    # Step 1: create a point and assign it to day 1.
    p1 = client.post(f"{POINT_ENDPOINT}/create", headers=auth_headers,
                     json={"dayId": day0_id, "type": "stop"}).json
    first_apply = client.post(
        f"{ITINERARY_ENDPOINT}/{itinerary['id']}/apply-boundaries",
        headers=auth_headers,
        json={
            "boundaries": [
                {"dayId": day1_id, "startPointId": p1['id'], "endPointId": p1['id'], "date": None},
            ],
            "points": [],
        }
    )
    assert first_apply.status_code == 200

    # Step 2: add a second point.  It goes to day 0 (staging).
    # With the bug it is orphaned; with the fix it links after p1.
    p2 = client.post(f"{POINT_ENDPOINT}/create", headers=auth_headers,
                     json={"dayId": day0_id, "type": "stop"}).json

    # Step 3: apply again with p2 as day 2's endpoint — must not 400.
    second_apply = client.post(
        f"{ITINERARY_ENDPOINT}/{itinerary['id']}/apply-boundaries",
        headers=auth_headers,
        json={
            "boundaries": [
                {"dayId": day1_id, "startPointId": p1['id'], "endPointId": p1['id'], "date": None},
                {"dayId": day2_id, "startPointId": p1['id'], "endPointId": p2['id'], "date": None},
            ],
            "points": [],
        }
    )
    assert second_apply.status_code == 200


# --- Unit tests for _walk_linked_list ---

def _make_point(id_: str, next_id: str | None = None) -> object:
    p = types.SimpleNamespace()
    p.id = id_
    p.next_id = next_id
    return p


def test_walk_linked_list_single_chain():
    P1 = "01900000-0000-7000-8000-000000000001"
    P2 = "01900000-0000-7000-8000-000000000002"
    P3 = "01900000-0000-7000-8000-000000000003"
    points = [_make_point(P3), _make_point(P1, P2), _make_point(P2, P3)]
    assert ItineraryService._walk_linked_list(points) == [P1, P2, P3]


def test_walk_linked_list_includes_orphaned_chains():
    """Orphaned points (disconnected heads) must appear in the output."""
    P1 = "01900000-0000-7000-8000-000000000001"
    P2 = "01900000-0000-7000-8000-000000000002"
    P3 = "01900000-0000-7000-8000-000000000003"
    # Main chain: P1 → P2.  Orphan: P3 (no next, nobody references it).
    points = [_make_point(P3), _make_point(P1, P2), _make_point(P2)]
    result = ItineraryService._walk_linked_list(points)
    assert set(result) == {P1, P2, P3}
    # Main chain order preserved
    assert result.index(P1) < result.index(P2)
    # Orphan appended after (higher UUID = later creation)
    assert result[-1] == P3


def test_walk_linked_list_empty():
    assert ItineraryService._walk_linked_list([]) == []


def test_walk_linked_list_no_cycle():
    """Cyclic chains must not cause an infinite loop."""
    P1 = "01900000-0000-7000-8000-000000000001"
    P2 = "01900000-0000-7000-8000-000000000002"
    # P1 → P2 → P1 (cycle, no real head; falls back to empty list)
    points = [_make_point(P1, P2), _make_point(P2, P1)]
    result = ItineraryService._walk_linked_list(points)
    assert len(result) == 0  # no heads → empty


def test_get_all_itineraries_returns_owned(client, auth_headers, itinerary):
    """GET /itinerary/all returns itineraries owned by the current user."""
    response = client.get(f"{ITINERARY_ENDPOINT}/all", headers=auth_headers)
    assert response.status_code == 200
    ids = [i["id"] for i in response.json]
    assert itinerary["id"] in ids


def test_happening_transition_preserves_itinerary_ownership(client, auth_headers, itinerary):
    """Transitioning a trip to 'happening' must not clear the itinerary's user_id.

    Before ADR-026 the service nulled out user_id on the itinerary when the trip went
    live, causing the itinerary to vanish from GET /itinerary/all.  That behaviour was
    removed: ownership is now preserved through all trip state transitions.
    """
    trip_id = itinerary["tripId"]
    client.post(f"{TRIP_ENDPOINT}/{trip_id}/state", json={"state": "happening"}, headers=auth_headers)

    response = client.get(f"{ITINERARY_ENDPOINT}/all", headers=auth_headers)
    assert response.status_code == 200
    ids = [i["id"] for i in response.json]
    assert itinerary["id"] in ids, "itinerary disappeared from listing after trip went to happening"
