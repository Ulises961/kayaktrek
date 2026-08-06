"""
Pagination tests for GET /api/log/all, GET /api/log/endorsed (M12 §K), and
GET /api/trip/<user_id>/all. Also covers the range/enum filters added to both
listings (M12 §24 follow-up) — severity/distance on logs, state/difficulty/
distance on trips.
"""
import json
import pytest

from Api.database import db
from Models.day import Day
from Models.itinerary import Itinerary
from Models.log import Log
from Models.point import Point
from Services.log_service import LogService
from Resources.log_resource import LOG_ENDPOINT
from Resources.trip_resource import TRIP_ENDPOINT


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _create_log(client, headers, date=None):
    body = {
        "distanceKm": 5.0,
        "durationMinutes": 60,
        "notes": "pagination test log",
    }
    if date:
        body["date"] = date
    r = client.post(f"{LOG_ENDPOINT}/create", headers=headers, json=body)
    assert r.status_code == 201
    return json.loads(r.data)


def _create_trip(client, headers):
    r = client.post(f"{TRIP_ENDPOINT}/create", json={"inventory": {}}, headers=headers)
    assert r.status_code == 201
    return json.loads(r.data)


def _create_trip_log(client, headers, trip_id, date=None):
    body = {"hours": 4, "avgSea": 2, "tripId": trip_id}
    if date:
        body["date"] = date
    r = client.post(f"{LOG_ENDPOINT}/create", headers=headers, json=body)
    assert r.status_code == 201
    return json.loads(r.data)["id"]


def _create_log_with(client, headers, **fields):
    body = {"notes": "filter test log", **fields}
    r = client.post(f"{LOG_ENDPOINT}/create", headers=headers, json=body)
    assert r.status_code == 201
    return json.loads(r.data)


# ---------------------------------------------------------------------------
# Log pagination
# ---------------------------------------------------------------------------

class TestLogPagination:

    def test_response_has_envelope_fields(self, client, auth_headers):
        r = client.get(f"{LOG_ENDPOINT}/all", headers=auth_headers)
        assert r.status_code == 200
        data = json.loads(r.data)
        for key in ("items", "total", "page", "pages"):
            assert key in data, f"missing '{key}' in envelope"

    def test_default_page_is_1(self, client, auth_headers):
        r = client.get(f"{LOG_ENDPOINT}/all", headers=auth_headers)
        data = json.loads(r.data)
        assert data["page"] == 1

    def test_page_2_returns_different_items(self, client, auth_headers):
        """Create enough logs so page 2 exists and differs from page 1."""
        created = []
        for _ in range(3):
            log = _create_log(client, auth_headers)
            created.append(log["id"])

        p1 = json.loads(client.get(
            f"{LOG_ENDPOINT}/all?page=1&per_page=2", headers=auth_headers
        ).data)
        p2 = json.loads(client.get(
            f"{LOG_ENDPOINT}/all?page=2&per_page=2", headers=auth_headers
        ).data)

        ids_p1 = {item["id"] for item in p1["items"]}
        ids_p2 = {item["id"] for item in p2["items"]}
        assert ids_p1.isdisjoint(ids_p2), "page 1 and page 2 overlap"

        # cleanup
        for lid in created:
            client.delete(f"{LOG_ENDPOINT}/{lid}", headers=auth_headers)

    def test_per_page_capped_at_100(self, client, auth_headers):
        """Even when requesting per_page=999, the response should be capped at 100."""
        r = client.get(f"{LOG_ENDPOINT}/all?per_page=999", headers=auth_headers)
        assert r.status_code == 200
        data = json.loads(r.data)
        # The resource layer caps per_page at 100 via min(per_page, 100)
        assert len(data["items"]) <= 100, "per_page not capped at 100"

    def test_total_reflects_all_items(self, client, auth_headers):
        """total matches regardless of which page is requested."""
        t1 = json.loads(client.get(
            f"{LOG_ENDPOINT}/all?page=1&per_page=1", headers=auth_headers
        ).data)["total"]
        t2 = json.loads(client.get(
            f"{LOG_ENDPOINT}/all?page=2&per_page=1", headers=auth_headers
        ).data)["total"]
        assert t1 == t2

    def test_default_sort_is_newest_first(self, client, auth_headers):
        older = _create_log(client, auth_headers, date="2026-01-01")
        newer = _create_log(client, auth_headers, date="2026-06-01")
        try:
            r = json.loads(client.get(
                f"{LOG_ENDPOINT}/all?per_page=2", headers=auth_headers
            ).data)
            ids = [item["id"] for item in r["items"]]
            assert ids.index(newer["id"]) < ids.index(older["id"])
        finally:
            client.delete(f"{LOG_ENDPOINT}/{older['id']}", headers=auth_headers)
            client.delete(f"{LOG_ENDPOINT}/{newer['id']}", headers=auth_headers)

    def test_sort_oldest_reverses_order(self, client, auth_headers):
        older = _create_log(client, auth_headers, date="2026-01-01")
        newer = _create_log(client, auth_headers, date="2026-06-01")
        try:
            r = json.loads(client.get(
                f"{LOG_ENDPOINT}/all?per_page=2&sort=oldest", headers=auth_headers
            ).data)
            ids = [item["id"] for item in r["items"]]
            assert ids.index(older["id"]) < ids.index(newer["id"])
        finally:
            client.delete(f"{LOG_ENDPOINT}/{older['id']}", headers=auth_headers)
            client.delete(f"{LOG_ENDPOINT}/{newer['id']}", headers=auth_headers)


# ---------------------------------------------------------------------------
# Endorsed log pagination (M12 §K)
# ---------------------------------------------------------------------------

class TestEndorsedLogPagination:

    @pytest.fixture(autouse=True)
    def _clean(self, user_1, user_2):
        yield
        db.session.query(Log).filter(Log.user_id == user_1.id).delete(synchronize_session=False)
        db.session.commit()

    def test_response_has_envelope_fields(self, client, auth_headers_2, trip_with_user2_as_crew):
        leader = trip_with_user2_as_crew["leader_headers"]
        crew_id = trip_with_user2_as_crew["crew_id"]
        log_id = _create_trip_log(client, leader, trip_with_user2_as_crew["trip"]["id"])
        LogService.endorse_log(log_id, crew_id)

        r = client.get(f"{LOG_ENDPOINT}/endorsed", headers=trip_with_user2_as_crew["crew_headers"])
        assert r.status_code == 200
        data = json.loads(r.data)
        for key in ("items", "total", "page", "pages"):
            assert key in data, f"missing '{key}' in envelope"

    def test_page_2_returns_different_items(self, client, trip_with_user2_as_crew):
        leader = trip_with_user2_as_crew["leader_headers"]
        crew = trip_with_user2_as_crew["crew_headers"]
        crew_id = trip_with_user2_as_crew["crew_id"]
        trip_id = trip_with_user2_as_crew["trip"]["id"]

        log_ids = [_create_trip_log(client, leader, trip_id) for _ in range(3)]
        for log_id in log_ids:
            LogService.endorse_log(log_id, crew_id)

        p1 = json.loads(client.get(f"{LOG_ENDPOINT}/endorsed?page=1&per_page=2", headers=crew).data)
        p2 = json.loads(client.get(f"{LOG_ENDPOINT}/endorsed?page=2&per_page=2", headers=crew).data)
        ids_p1 = {item["id"] for item in p1["items"]}
        ids_p2 = {item["id"] for item in p2["items"]}
        assert ids_p1.isdisjoint(ids_p2), "page 1 and page 2 overlap"
        assert p1["total"] == 3

    def test_per_page_capped_at_100(self, client, trip_with_user2_as_crew):
        """Even when requesting per_page=999, the response should be capped at 100."""
        crew = trip_with_user2_as_crew["crew_headers"]
        r = client.get(f"{LOG_ENDPOINT}/endorsed?per_page=999", headers=crew)
        assert r.status_code == 200
        data = json.loads(r.data)
        # The resource layer caps per_page at 100 via min(per_page, 100)
        assert len(data["items"]) <= 100, "per_page not capped at 100"

    def test_sort_oldest_reverses_order(self, client, trip_with_user2_as_crew):
        leader = trip_with_user2_as_crew["leader_headers"]
        crew = trip_with_user2_as_crew["crew_headers"]
        crew_id = trip_with_user2_as_crew["crew_id"]
        trip_id = trip_with_user2_as_crew["trip"]["id"]

        older_id = _create_trip_log(client, leader, trip_id, date="2026-01-01")
        newer_id = _create_trip_log(client, leader, trip_id, date="2026-06-01")
        LogService.endorse_log(older_id, crew_id)
        LogService.endorse_log(newer_id, crew_id)

        r = json.loads(client.get(f"{LOG_ENDPOINT}/endorsed?sort=oldest", headers=crew).data)
        ids = [item["id"] for item in r["items"]]
        assert ids.index(older_id) < ids.index(newer_id)


# ---------------------------------------------------------------------------
# Trip pagination
# ---------------------------------------------------------------------------

class TestTripPagination:

    def test_response_has_envelope_fields(self, client, auth_headers, id):
        r = client.get(f"{TRIP_ENDPOINT}/{id}/all", headers=auth_headers)
        assert r.status_code == 200
        data = json.loads(r.data)
        for key in ("items", "total", "page", "pages"):
            assert key in data, f"missing '{key}' in envelope"

    def test_default_page_is_1(self, client, auth_headers, id):
        r = client.get(f"{TRIP_ENDPOINT}/{id}/all", headers=auth_headers)
        data = json.loads(r.data)
        assert data["page"] == 1

    def test_page_2_returns_different_items(self, client, auth_headers, id):
        """Create enough trips so page 2 exists and differs from page 1."""
        created = []
        for _ in range(3):
            trip = _create_trip(client, auth_headers)
            created.append(trip["id"])

        p1 = json.loads(client.get(
            f"{TRIP_ENDPOINT}/{id}/all?page=1&per_page=2", headers=auth_headers
        ).data)
        p2 = json.loads(client.get(
            f"{TRIP_ENDPOINT}/{id}/all?page=2&per_page=2", headers=auth_headers
        ).data)

        ids_p1 = {item["id"] for item in p1["items"]}
        ids_p2 = {item["id"] for item in p2["items"]}
        assert ids_p1.isdisjoint(ids_p2), "page 1 and page 2 overlap"

        for tid in created:
            client.delete(f"{TRIP_ENDPOINT}/{tid}", headers=auth_headers)

    def test_per_page_capped_at_100(self, client, auth_headers, id):
        """Even when requesting per_page=999, the response should be capped at 100."""
        r = client.get(f"{TRIP_ENDPOINT}/{id}/all?per_page=999", headers=auth_headers)
        assert r.status_code == 200
        data = json.loads(r.data)
        # The resource layer caps per_page at 100 via min(per_page, 100)
        assert len(data["items"]) <= 100, "per_page not capped at 100"


# ---------------------------------------------------------------------------
# Log filtering — severity (avg_sea) and distance ranges
# ---------------------------------------------------------------------------

class TestLogFiltering:

    def test_filter_by_min_sea(self, client, auth_headers):
        calm = _create_log_with(client, auth_headers, avgSea=1)
        rough = _create_log_with(client, auth_headers, avgSea=6)
        try:
            r = json.loads(client.get(f"{LOG_ENDPOINT}/all?min_sea=4", headers=auth_headers).data)
            ids = {item["id"] for item in r["items"]}
            assert rough["id"] in ids
            assert calm["id"] not in ids
        finally:
            client.delete(f"{LOG_ENDPOINT}/{calm['id']}", headers=auth_headers)
            client.delete(f"{LOG_ENDPOINT}/{rough['id']}", headers=auth_headers)

    def test_filter_by_max_sea(self, client, auth_headers):
        calm = _create_log_with(client, auth_headers, avgSea=1)
        rough = _create_log_with(client, auth_headers, avgSea=6)
        try:
            r = json.loads(client.get(f"{LOG_ENDPOINT}/all?max_sea=2", headers=auth_headers).data)
            ids = {item["id"] for item in r["items"]}
            assert calm["id"] in ids
            assert rough["id"] not in ids
        finally:
            client.delete(f"{LOG_ENDPOINT}/{calm['id']}", headers=auth_headers)
            client.delete(f"{LOG_ENDPOINT}/{rough['id']}", headers=auth_headers)

    def test_filter_by_distance_range(self, client, auth_headers):
        short = _create_log_with(client, auth_headers, distance=2.0)
        long_ = _create_log_with(client, auth_headers, distance=20.0)
        try:
            r = json.loads(client.get(
                f"{LOG_ENDPOINT}/all?min_distance=10&max_distance=30", headers=auth_headers
            ).data)
            ids = {item["id"] for item in r["items"]}
            assert long_["id"] in ids
            assert short["id"] not in ids
        finally:
            client.delete(f"{LOG_ENDPOINT}/{short['id']}", headers=auth_headers)
            client.delete(f"{LOG_ENDPOINT}/{long_['id']}", headers=auth_headers)

    def test_filters_apply_to_endorsed_logs_too(self, client, trip_with_user2_as_crew):
        leader = trip_with_user2_as_crew["leader_headers"]
        crew = trip_with_user2_as_crew["crew_headers"]
        crew_id = trip_with_user2_as_crew["crew_id"]
        trip_id = trip_with_user2_as_crew["trip"]["id"]

        calm_id = _create_trip_log(client, leader, trip_id)
        rough_body = {"hours": 4, "avgSea": 6, "tripId": trip_id}
        rough_id = json.loads(
            client.post(f"{LOG_ENDPOINT}/create", headers=leader, json=rough_body).data
        )["id"]
        LogService.endorse_log(calm_id, crew_id)
        LogService.endorse_log(rough_id, crew_id)

        r = json.loads(client.get(f"{LOG_ENDPOINT}/endorsed?min_sea=4", headers=crew).data)
        ids = {item["id"] for item in r["items"]}
        assert rough_id in ids
        assert calm_id not in ids


# ---------------------------------------------------------------------------
# Trip filtering — state, difficulty, sort, distance
# ---------------------------------------------------------------------------

class TestTripFiltering:

    def test_filter_by_difficulty(self, client, auth_headers, id):
        easy = _create_trip(client, auth_headers)
        hard = _create_trip(client, auth_headers)
        client.patch(
            f"{TRIP_ENDPOINT}/{easy['id']}", headers=auth_headers, json={"difficulty": "easy"}
        )
        client.patch(
            f"{TRIP_ENDPOINT}/{hard['id']}", headers=auth_headers, json={"difficulty": "expert"}
        )
        try:
            r = json.loads(client.get(
                f"{TRIP_ENDPOINT}/{id}/all?difficulty=easy", headers=auth_headers
            ).data)
            ids = {item["id"] for item in r["items"]}
            assert easy["id"] in ids
            assert hard["id"] not in ids
        finally:
            client.delete(f"{TRIP_ENDPOINT}/{easy['id']}", headers=auth_headers)
            client.delete(f"{TRIP_ENDPOINT}/{hard['id']}", headers=auth_headers)

    def test_filter_by_state(self, client, auth_headers, id):
        planning = _create_trip(client, auth_headers)
        happening = _create_trip(client, auth_headers)
        client.post(
            f"{TRIP_ENDPOINT}/{happening['id']}/state",
            headers=auth_headers,
            json={"state": "happening"},
        )
        try:
            r = json.loads(client.get(
                f"{TRIP_ENDPOINT}/{id}/all?state=happening", headers=auth_headers
            ).data)
            ids = {item["id"] for item in r["items"]}
            assert happening["id"] in ids
            assert planning["id"] not in ids
        finally:
            client.delete(f"{TRIP_ENDPOINT}/{planning['id']}", headers=auth_headers)
            client.delete(f"{TRIP_ENDPOINT}/{happening['id']}", headers=auth_headers)

    def test_invalid_state_returns_400(self, client, auth_headers, id):
        """Invalid enum values on state filter should return 400 with error details."""
        r = client.get(f"{TRIP_ENDPOINT}/{id}/all?state=bogus", headers=auth_headers)
        assert r.status_code == 400
        data = json.loads(r.data)
        # Verify the response has error information
        assert "error" in data or "message" in data, "missing error details in response"

    def test_invalid_difficulty_returns_400(self, client, auth_headers, id):
        """Invalid enum values on difficulty filter should return 400 with error details."""
        r = client.get(f"{TRIP_ENDPOINT}/{id}/all?difficulty=bogus", headers=auth_headers)
        assert r.status_code == 400
        data = json.loads(r.data)
        # Verify the response has error information
        assert "error" in data or "message" in data, "missing error details in response"

    def test_sort_soonest_orders_by_date_from(self, client, auth_headers, id):
        later = _create_trip(client, auth_headers)
        sooner = _create_trip(client, auth_headers)
        client.patch(
            f"{TRIP_ENDPOINT}/{later['id']}",
            headers=auth_headers,
            json={"dateFrom": "2026-09-01", "dateTo": "2026-09-05"},
        )
        client.patch(
            f"{TRIP_ENDPOINT}/{sooner['id']}",
            headers=auth_headers,
            json={"dateFrom": "2026-08-01", "dateTo": "2026-08-05"},
        )
        try:
            r = json.loads(client.get(
                f"{TRIP_ENDPOINT}/{id}/all?sort=soonest", headers=auth_headers
            ).data)
            ids = [item["id"] for item in r["items"]]
            assert ids.index(sooner["id"]) < ids.index(later["id"])
        finally:
            client.delete(f"{TRIP_ENDPOINT}/{later['id']}", headers=auth_headers)
            client.delete(f"{TRIP_ENDPOINT}/{sooner['id']}", headers=auth_headers)

    def test_sort_latest_end_orders_by_date_to_descending(self, client, auth_headers, id):
        older_past = _create_trip(client, auth_headers)
        recent_past = _create_trip(client, auth_headers)
        client.patch(
            f"{TRIP_ENDPOINT}/{older_past['id']}",
            headers=auth_headers,
            json={"dateFrom": "2026-01-01", "dateTo": "2026-01-05"},
        )
        client.patch(
            f"{TRIP_ENDPOINT}/{recent_past['id']}",
            headers=auth_headers,
            json={"dateFrom": "2026-06-01", "dateTo": "2026-06-05"},
        )
        try:
            r = json.loads(client.get(
                f"{TRIP_ENDPOINT}/{id}/all?sort=latest_end", headers=auth_headers
            ).data)
            ids = [item["id"] for item in r["items"]]
            assert ids.index(recent_past["id"]) < ids.index(older_past["id"])
        finally:
            client.delete(f"{TRIP_ENDPOINT}/{older_past['id']}", headers=auth_headers)
            client.delete(f"{TRIP_ENDPOINT}/{recent_past['id']}", headers=auth_headers)

    def test_filter_by_distance_range_uses_computed_route_length(
        self, client, auth_headers, id, user_1
    ):
        """`Itinerary.total_miles` is never persisted (see compute_total_miles's
        docstring) — the distance filter must walk real point geometry, not that
        stale column, so this builds genuine day/point rows for a short and a
        long route."""
        short_trip = _create_trip(client, auth_headers)
        long_trip = _create_trip(client, auth_headers)

        short_itinerary = Itinerary(name="short", user_id=user_1.id, trip_id=short_trip["id"])
        long_itinerary = Itinerary(name="long", user_id=user_1.id, trip_id=long_trip["id"])
        db.session.add_all([short_itinerary, long_itinerary])
        db.session.flush()

        def _add_route(itinerary, coords):
            day = Day(day_number=1, itinerary_id=itinerary.id)
            db.session.add(day)
            db.session.flush()
            prev_point = None
            for lat, lng in coords:
                point = Point(latitude=lat, longitude=lng, day_id=day.id)
                db.session.add(point)
                db.session.flush()
                if prev_point is not None:
                    prev_point.next_id = point.id
                prev_point = point

        _add_route(short_itinerary, [(43.0, 8.0), (43.1, 8.0)])  # ~6 nm
        _add_route(long_itinerary, [(43.0, 8.0), (43.9, 8.0)])  # ~54 nm
        db.session.commit()

        try:
            r = json.loads(client.get(
                f"{TRIP_ENDPOINT}/{id}/all?min_miles=30", headers=auth_headers
            ).data)
            ids = {item["id"] for item in r["items"]}
            assert long_trip["id"] in ids
            assert short_trip["id"] not in ids
        finally:
            for itinerary in (short_itinerary, long_itinerary):
                day_ids = [d.id for d in db.session.query(Day).filter_by(itinerary_id=itinerary.id)]
                if day_ids:
                    db.session.query(Point).filter(Point.day_id.in_(day_ids)).delete(
                        synchronize_session=False
                    )
                db.session.query(Day).filter_by(itinerary_id=itinerary.id).delete(
                    synchronize_session=False
                )
                db.session.query(Itinerary).filter_by(id=itinerary.id).delete(
                    synchronize_session=False
                )
            db.session.commit()
            client.delete(f"{TRIP_ENDPOINT}/{short_trip['id']}", headers=auth_headers)
            client.delete(f"{TRIP_ENDPOINT}/{long_trip['id']}", headers=auth_headers)
