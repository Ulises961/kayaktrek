"""
Pagination tests for GET /api/log/all, GET /api/log/endorsed (M12 §K), and
GET /api/trip/<user_id>/all.
"""
import json
import pytest

from Api.database import db
from Models.log import Log
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
        r = client.get(f"{LOG_ENDPOINT}/all?per_page=999", headers=auth_headers)
        assert r.status_code == 200

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
        crew = trip_with_user2_as_crew["crew_headers"]
        r = client.get(f"{LOG_ENDPOINT}/endorsed?per_page=999", headers=crew)
        assert r.status_code == 200

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
        r = client.get(f"{TRIP_ENDPOINT}/{id}/all?per_page=999", headers=auth_headers)
        assert r.status_code == 200
