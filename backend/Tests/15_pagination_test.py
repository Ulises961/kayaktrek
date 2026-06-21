"""
Pagination tests for GET /api/log/all and GET /api/trip/<user_id>/all.
"""
import json
import pytest

from Resources.log_resource import LOG_ENDPOINT
from Resources.trip_resource import TRIP_ENDPOINT


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _create_log(client, headers):
    r = client.post(f"{LOG_ENDPOINT}/create", headers=headers, json={
        "distanceKm": 5.0,
        "durationMinutes": 60,
        "notes": "pagination test log",
    })
    assert r.status_code == 201
    return json.loads(r.data)


def _create_trip(client, headers):
    r = client.post(f"{TRIP_ENDPOINT}/create", json={"inventory": {}}, headers=headers)
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
