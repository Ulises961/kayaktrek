"""Tests for the route's dedicated sync channel (M9c WP1 items 7-8):
Resources/mobile_sync_resource.py's /route/pull, /route/push, /route/resolve
+ Services/itinerary_route_sync_service.py.
"""
import uuid_extension

from Resources.mobile_sync_resource import MOBILE_SYNC_ENDPOINT
from Resources.point_resource import POINT_ENDPOINT


def _pull_route(client, headers, trip_id):
    return client.get(f"{MOBILE_SYNC_ENDPOINT}/trip/{trip_id}/route/pull", headers=headers)


def _push_route(client, headers, trip_id, base_route_version, days, points):
    return client.post(
        f"{MOBILE_SYNC_ENDPOINT}/trip/{trip_id}/route/push",
        headers=headers,
        json={"baseRouteVersion": base_route_version, "days": days, "points": points},
    )


def _resolve_route(client, headers, trip_id, days, points):
    return client.post(
        f"{MOBILE_SYNC_ENDPOINT}/trip/{trip_id}/route/resolve",
        headers=headers,
        json={"days": days, "points": points},
    )


def _route_of_three(client, headers, itinerary):
    day0_id = next(d["id"] for d in itinerary["days"] if d["dayNumber"] == 0)
    points = []
    for lat in (44.0, 44.1, 44.2):
        resp = client.post(
            f"{POINT_ENDPOINT}/create", headers=headers,
            json={"dayId": day0_id, "type": "position", "latitude": lat, "longitude": 8.5},
        )
        assert resp.status_code == 201
        points.append(resp.json)
    return points


# ── pull ────────────────────────────────────────────────────────────────────

def test_pull_route_requires_trip_membership(client, outsider_headers, trip_with_crew):
    trip_id = trip_with_crew["trip"]["id"]
    resp = _pull_route(client, outsider_headers, trip_id)
    assert resp.status_code == 403


def test_pull_route_returns_order_keys_not_next_id(client, auth_headers, itinerary):
    points = _route_of_three(client, auth_headers, itinerary)
    resp = _pull_route(client, auth_headers, itinerary["tripId"])
    assert resp.status_code == 200
    data = resp.json
    assert isinstance(data["routeVersion"], int)

    point_ids = {p["id"] for p in points}
    returned = [p for p in data["points"] if p["id"] in point_ids]
    assert len(returned) == 3
    for point in returned:
        assert "orderKey" in point
        assert "nextId" not in point
    keys = sorted(p["orderKey"] for p in returned)
    assert keys == [p["orderKey"] for p in sorted(returned, key=lambda p: p["orderKey"])]


# ── push: ordinary case ──────────────────────────────────────────────────────

def test_push_route_reorders_via_order_keys(client, auth_headers, itinerary):
    points = _route_of_three(client, auth_headers, itinerary)
    pulled = _pull_route(client, auth_headers, itinerary["tripId"]).json
    base_version = pulled["routeVersion"]

    point_ids = {p["id"] for p in points}
    route_points = [p for p in pulled["points"] if p["id"] in point_ids]
    # Reverse the order by swapping order keys pairwise.
    keys = sorted(p["orderKey"] for p in route_points)
    reversed_points = []
    for point, key in zip(sorted(route_points, key=lambda p: p["orderKey"], reverse=True), keys):
        reversed_points.append({**point, "orderKey": key})

    resp = _push_route(client, auth_headers, itinerary["tripId"], base_version, pulled["days"], reversed_points)
    assert resp.status_code == 200
    assert resp.json["routeVersion"] == base_version + 1

    after = _pull_route(client, auth_headers, itinerary["tripId"]).json
    after_points = sorted(
        [p for p in after["points"] if p["id"] in point_ids], key=lambda p: p["orderKey"]
    )
    assert [p["id"] for p in after_points] == [p["id"] for p in reversed(points)]


def test_push_route_creates_a_new_point(client, auth_headers, itinerary):
    _route_of_three(client, auth_headers, itinerary)
    pulled = _pull_route(client, auth_headers, itinerary["tripId"]).json
    base_version = pulled["routeVersion"]

    new_id = str(uuid_extension.uuid7())
    new_points = pulled["points"] + [{
        "id": new_id, "dayId": pulled["points"][0]["dayId"], "orderKey": "999999",
        "latitude": 44.3, "longitude": 8.6, "type": "position",
    }]

    resp = _push_route(client, auth_headers, itinerary["tripId"], base_version, pulled["days"], new_points)
    assert resp.status_code == 200

    after = _pull_route(client, auth_headers, itinerary["tripId"]).json
    assert any(p["id"] == new_id for p in after["points"])


def test_push_route_deletes_points_missing_from_payload(client, auth_headers, itinerary):
    points = _route_of_three(client, auth_headers, itinerary)
    pulled = _pull_route(client, auth_headers, itinerary["tripId"]).json
    base_version = pulled["routeVersion"]

    kept = [p for p in pulled["points"] if p["id"] != points[0]["id"]]

    resp = _push_route(client, auth_headers, itinerary["tripId"], base_version, pulled["days"], kept)
    assert resp.status_code == 200

    after = _pull_route(client, auth_headers, itinerary["tripId"]).json
    remaining_ids = {p["id"] for p in after["points"]}
    assert points[0]["id"] not in remaining_ids
    assert points[1]["id"] in remaining_ids
    assert points[2]["id"] in remaining_ids


def test_push_route_409_on_stale_base_version(client, auth_headers, itinerary):
    _route_of_three(client, auth_headers, itinerary)
    pulled = _pull_route(client, auth_headers, itinerary["tripId"]).json

    resp = _push_route(
        client, auth_headers, itinerary["tripId"], pulled["routeVersion"] - 1, pulled["days"], pulled["points"]
    )
    assert resp.status_code == 409


def test_push_route_requires_leader(client, trip_with_crew):
    trip_id = trip_with_crew["trip"]["id"]
    resp = _push_route(client, trip_with_crew["crew_headers"], trip_id, 1, [], [])
    assert resp.status_code == 403


# ── resolve: human-adjudicated case ─────────────────────────────────────────

def test_resolve_route_accepts_a_mismatched_point_set(client, auth_headers, itinerary):
    points = _route_of_three(client, auth_headers, itinerary)
    pulled = _pull_route(client, auth_headers, itinerary["tripId"]).json
    base_version = pulled["routeVersion"]

    # Diverge: bump the version out from under this base via an ordinary push first.
    kept_for_divergence = [p for p in pulled["points"] if p["id"] != points[2]["id"]]
    divergence_resp = _push_route(
        client, auth_headers, itinerary["tripId"], base_version, pulled["days"], kept_for_divergence
    )
    assert divergence_resp.status_code == 200

    # Now resolve() with a point set that includes points[2] again — a plain
    # push with the OLD base_version would 409; resolve() is the exception.
    resolve_resp = _resolve_route(client, auth_headers, itinerary["tripId"], pulled["days"], pulled["points"])
    assert resolve_resp.status_code == 200

    after = _pull_route(client, auth_headers, itinerary["tripId"]).json
    after_ids = {p["id"] for p in after["points"]}
    assert points[2]["id"] in after_ids


def test_resolve_route_requires_leader(client, trip_with_crew):
    trip_id = trip_with_crew["trip"]["id"]
    resp = _resolve_route(client, trip_with_crew["crew_headers"], trip_id, [], [])
    assert resp.status_code == 403
