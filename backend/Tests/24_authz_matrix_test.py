"""
Authorization matrix — whole-API sweep.

Three actor columns per protected endpoint:
  no_auth  → expect 401 (auth middleware fires before any DB lookup)
  outsider → expect 403 (authenticated user with no relation to the resource)
  crew     → expect 403 on leader-only actions (§4 only)

Sections
--------
§1  No-auth sweep (401)
      All @JWTService.authenticate_restful endpoints with a dummy UUID.
      Auth check fires first — the resource ID is irrelevant.
      Excluded (intentionally public, no auth decorator):
        GET  /api/user/me/data-export/<token>
        DELETE /api/user/me/deletion-request
        POST /api/auth/activate-test

§2  Non-member sweep (403)
      Trip-scoped endpoints called with real IDs by an authenticated outsider.
      Also covers user-scoped endpoints where "outsider" means "a different user".

§3  Leader-only sweep (403)
      Endpoints decorated with @require_leader called by a crew member.
"""
import json

import pytest

from Resources.day_resource import DAY_ENDPOINT
from Resources.float_plan_resource import FLOAT_PLAN_ENDPOINT
from Resources.inventory_resource import INVENTORY_ENDPOINT
from Resources.item_resource import ITEM_ENDPOINT
from Resources.itinerary_resource import ITINERARY_ENDPOINT
from Resources.log_resource import LOG_ENDPOINT
from Resources.logistics_resource import LOGISTICS_ENDPOINT
from Resources.point_resource import POINT_ENDPOINT
from Resources.shuttle_resource import SHUTTLE_ENDPOINT
from Resources.travel_document_resource import TRAVEL_DOCUMENT_ENDPOINT
from Resources.trip_resource import TRIP_ENDPOINT
from Resources.user_resource import USER_ENDPOINT
from Resources.user_certification_resource import CERT_ENDPOINT

# A valid UUID v7 that does not exist in the database — used in the 401 sweep
# where the auth check fires before any resource lookup.
DUMMY_ID = "01900000-0000-7000-8000-000000000001"


# ---------------------------------------------------------------------------
# Fixture — full resource tree owned by user_1 (leader), user_2 as crew
# ---------------------------------------------------------------------------

@pytest.fixture(scope="function")
def authz_resources(client, auth_headers, auth_headers_2, user_1, user_2, category_ids):
    """
    Creates a complete resource tree for the §2 and §3 sweeps.

    user_1 = leader (auth_headers)
    user_2 = crew   (auth_headers_2)
    """
    # Trip — include one day so day_id and point_id are available without the broken
    # standalone POST /api/day/create endpoint (DayService.create_day expects a Day
    # model, not the raw dict the resource passes it — pre-existing bug).
    trip_r = client.post(
        f"{TRIP_ENDPOINT}/create",
        json={
            "inventory": {},
            "itinerary": {
                "isPublic": False,
                "totalMiles": 0,
                "days": [{"dayNumber": 1, "date": "2026-08-01", "points": []}],
            },
        },
        headers=auth_headers,
    )
    assert trip_r.status_code == 201, trip_r.data
    trip = json.loads(trip_r.data)
    trip_id = trip["id"]
    itinerary_id = trip["itinerary"]["id"]
    inventory_id = trip["inventory"]["id"]
    day_id = trip["itinerary"]["days"][0]["id"]

    # user_2 joins as crew
    inv_r = client.post(f"{TRIP_ENDPOINT}/{trip_id}/invite", json={"userId": str(user_2.id)}, headers=auth_headers)
    assert inv_r.status_code == 201, inv_r.data
    accept_r = client.post(f"{TRIP_ENDPOINT}/{trip_id}/invitation", json={"accepted": True}, headers=auth_headers_2)
    assert accept_r.status_code == 200, accept_r.data

    # Leader's TripMember id
    me_r = client.get(f"{TRIP_ENDPOINT}/{trip_id}/member/me", headers=auth_headers)
    assert me_r.status_code == 200, me_r.data
    leader_member_id = json.loads(me_r.data)["id"]

    # Travel document
    doc_r = client.post(
        f"{TRAVEL_DOCUMENT_ENDPOINT}/{trip_id}/create",
        json={"type": "accommodation", "name": "Matrix Hotel"},
        headers=auth_headers,
    )
    assert doc_r.status_code == 201, doc_r.data
    doc_id = json.loads(doc_r.data)["id"]

    # Shuttle vehicle
    shuttle_r = client.post(
        f"{SHUTTLE_ENDPOINT}/{trip_id}/create",
        json={"vehicleDescription": "Matrix Van"},
        headers=auth_headers,
    )
    assert shuttle_r.status_code == 201, shuttle_r.data
    vehicle_id = json.loads(shuttle_r.data)["id"]

    # Point
    point_r = client.post(
        f"{POINT_ENDPOINT}/create",
        json={"dayId": day_id, "type": "stop", "lat": 44.0, "lon": 9.0, "name": "Matrix Stop"},
        headers=auth_headers,
    )
    assert point_r.status_code == 201, point_r.data
    point_id = json.loads(point_r.data)["id"]

    # Personal inventory + item (user_1 only — not a trip inventory)
    personal_inv_r = client.post(f"{INVENTORY_ENDPOINT}/create", json={}, headers=auth_headers)
    assert personal_inv_r.status_code == 201, personal_inv_r.data
    personal_inv_id = json.loads(personal_inv_r.data)["id"]

    item_r = client.post(
        f"{ITEM_ENDPOINT}/create",
        json={"inventoryId": personal_inv_id, "categoryId": category_ids["generic"], "name": "Matrix Item"},
        headers=auth_headers,
    )
    assert item_r.status_code == 201, item_r.data
    item_id = json.loads(item_r.data)["id"]

    # Log (user_1)
    log_r = client.post(f"{LOG_ENDPOINT}/create", json={"hours": 1, "avgSea": 1}, headers=auth_headers)
    assert log_r.status_code == 201, log_r.data
    log_id = json.loads(log_r.data)["id"]

    yield {
        "trip_id": trip_id,
        "itinerary_id": itinerary_id,
        "inventory_id": inventory_id,
        "leader_member_id": leader_member_id,
        "doc_id": doc_id,
        "vehicle_id": vehicle_id,
        "day_id": day_id,
        "point_id": point_id,
        "personal_inv_id": personal_inv_id,
        "item_id": item_id,
        "log_id": log_id,
        "leader_id": str(user_1.id),
    }

    client.delete(f"{TRIP_ENDPOINT}/{trip_id}", headers=auth_headers)
    try:
        client.delete(f"{INVENTORY_ENDPOINT}/{personal_inv_id}", headers=auth_headers)
    except Exception:
        pass
    try:
        client.delete(f"{LOG_ENDPOINT}/{log_id}", headers=auth_headers)
    except Exception:
        pass


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _req(client, method, url, headers=None, body=None):
    kwargs = {"headers": headers or {}}
    if body is not None:
        kwargs["json"] = body
    return getattr(client, method.lower())(url, **kwargs)


def _assert_status(client, method, url, expected, headers=None, body=None, label=""):
    r = _req(client, method, url, headers=headers, body=body)
    assert r.status_code == expected, (
        f"[{label}] {method} {url} → {r.status_code}, want {expected}"
    )


# ===========================================================================
# §1 — No-auth sweep: every protected endpoint must return 401
# ===========================================================================

class TestUnauthenticatedReturns401:
    """Auth middleware fires before any resource lookup — DUMMY_ID is fine here."""

    def _401(self, client, method, url, body=None):
        _assert_status(client, method, url, 401, body=body, label="NO_AUTH")

    # User
    def test_user_endpoints(self, client):
        D = DUMMY_ID
        self._401(client, "GET",    f"{USER_ENDPOINT}/me")
        self._401(client, "GET",    f"{USER_ENDPOINT}/search")
        self._401(client, "GET",    f"{USER_ENDPOINT}/{D}")
        self._401(client, "PATCH",  f"{USER_ENDPOINT}/{D}")
        self._401(client, "DELETE", f"{USER_ENDPOINT}/{D}")
        self._401(client, "PATCH",  f"{USER_ENDPOINT}/me/password")
        self._401(client, "POST",   f"{USER_ENDPOINT}/me/generate-keypair")
        self._401(client, "POST",   f"{USER_ENDPOINT}/me/re-auth")
        self._401(client, "POST",   f"{USER_ENDPOINT}/me/medical-consent")
        self._401(client, "DELETE", f"{USER_ENDPOINT}/me/medical-consent")
        self._401(client, "POST",   f"{USER_ENDPOINT}/me/medical-notes")
        self._401(client, "POST",   f"{USER_ENDPOINT}/me/avatar")
        self._401(client, "DELETE", f"{USER_ENDPOINT}/me/avatar")
        self._401(client, "POST",   f"{USER_ENDPOINT}/me/data-export")
        self._401(client, "DELETE", f"{USER_ENDPOINT}/me")
        self._401(client, "GET",    f"{CERT_ENDPOINT}")
        self._401(client, "POST",   f"{CERT_ENDPOINT}")
        self._401(client, "DELETE", f"{CERT_ENDPOINT}/{D}")

    # Trip
    def test_trip_endpoints(self, client):
        D = DUMMY_ID
        self._401(client, "GET",    f"{TRIP_ENDPOINT}/{D}")
        self._401(client, "GET",    f"{TRIP_ENDPOINT}/{D}/all")
        self._401(client, "GET",    f"{TRIP_ENDPOINT}/{D}/invitations")
        self._401(client, "POST",   f"{TRIP_ENDPOINT}/create")
        self._401(client, "POST",   f"{TRIP_ENDPOINT}/{D}/state")
        self._401(client, "PATCH",  f"{TRIP_ENDPOINT}/{D}")
        self._401(client, "DELETE", f"{TRIP_ENDPOINT}/{D}")
        self._401(client, "POST",   f"{TRIP_ENDPOINT}/{D}/invite")
        self._401(client, "DELETE", f"{TRIP_ENDPOINT}/{D}/invite/{D}")
        self._401(client, "POST",   f"{TRIP_ENDPOINT}/{D}/invitation")
        self._401(client, "DELETE", f"{TRIP_ENDPOINT}/{D}/member/{D}")
        self._401(client, "GET",    f"{TRIP_ENDPOINT}/{D}/member/me")
        self._401(client, "PATCH",  f"{TRIP_ENDPOINT}/{D}/member/me")
        self._401(client, "POST",   f"{TRIP_ENDPOINT}/{D}/member/me/medical-notes")
        self._401(client, "POST",   f"{TRIP_ENDPOINT}/{D}/member/me/medical-consent")
        self._401(client, "DELETE", f"{TRIP_ENDPOINT}/{D}/member/me/medical-consent")
        self._401(client, "POST",   f"{TRIP_ENDPOINT}/{D}/member/me/share-medical-notes")
        self._401(client, "POST",   f"{TRIP_ENDPOINT}/{D}/member/{D}/medical-notes")

    # Logistics + float plan
    def test_logistics_endpoints(self, client):
        D = DUMMY_ID
        self._401(client, "GET",  f"{LOGISTICS_ENDPOINT}/{D}")
        self._401(client, "PUT",  f"{LOGISTICS_ENDPOINT}/{D}")
        self._401(client, "POST", f"{LOGISTICS_ENDPOINT}/{D}/share")
        self._401(client, "POST", f"{LOGISTICS_ENDPOINT}/{D}/share/email")

    # Travel document
    def test_travel_document_endpoints(self, client):
        D = DUMMY_ID
        self._401(client, "GET",    f"{TRAVEL_DOCUMENT_ENDPOINT}/{D}/all")
        self._401(client, "POST",   f"{TRAVEL_DOCUMENT_ENDPOINT}/{D}/create")
        self._401(client, "PATCH",  f"{TRAVEL_DOCUMENT_ENDPOINT}/{D}")
        self._401(client, "DELETE", f"{TRAVEL_DOCUMENT_ENDPOINT}/{D}")
        self._401(client, "POST",   f"{TRAVEL_DOCUMENT_ENDPOINT}/{D}/attachment")
        self._401(client, "DELETE", f"{TRAVEL_DOCUMENT_ENDPOINT}/{D}/attachment")
        self._401(client, "GET",    f"{TRAVEL_DOCUMENT_ENDPOINT}/{D}/attachment")

    # Shuttle
    def test_shuttle_endpoints(self, client):
        D = DUMMY_ID
        self._401(client, "GET",    f"{SHUTTLE_ENDPOINT}/{D}/all")
        self._401(client, "POST",   f"{SHUTTLE_ENDPOINT}/{D}/create")
        self._401(client, "PATCH",  f"{SHUTTLE_ENDPOINT}/vehicle/{D}")
        self._401(client, "DELETE", f"{SHUTTLE_ENDPOINT}/vehicle/{D}")
        self._401(client, "POST",   f"{SHUTTLE_ENDPOINT}/vehicle/{D}/passenger")
        self._401(client, "DELETE", f"{SHUTTLE_ENDPOINT}/vehicle/{D}/passenger/{D}")

    # Itinerary
    def test_itinerary_endpoints(self, client):
        D = DUMMY_ID
        self._401(client, "GET",    f"{ITINERARY_ENDPOINT}/all")
        self._401(client, "GET",    f"{ITINERARY_ENDPOINT}/{D}")
        self._401(client, "POST",   f"{ITINERARY_ENDPOINT}/create")
        self._401(client, "PATCH",  f"{ITINERARY_ENDPOINT}/{D}")
        self._401(client, "DELETE", f"{ITINERARY_ENDPOINT}/{D}")

    # Day
    def test_day_endpoints(self, client):
        D = DUMMY_ID
        self._401(client, "GET",  f"{DAY_ENDPOINT}/itinerary/{D}")
        self._401(client, "GET",  f"{DAY_ENDPOINT}/{D}")
        self._401(client, "POST", f"{DAY_ENDPOINT}/by-key")
        self._401(client, "POST", f"{DAY_ENDPOINT}/create")
        self._401(client, "PATCH",  f"{DAY_ENDPOINT}/{D}")
        self._401(client, "DELETE", f"{DAY_ENDPOINT}/{D}")

    # Point
    def test_point_endpoints(self, client):
        D = DUMMY_ID
        self._401(client, "POST",   f"{POINT_ENDPOINT}/create")
        self._401(client, "GET",    f"{POINT_ENDPOINT}/{D}")
        self._401(client, "PATCH",  f"{POINT_ENDPOINT}/{D}")
        self._401(client, "DELETE", f"{POINT_ENDPOINT}/{D}")
        self._401(client, "POST",   f"{POINT_ENDPOINT}/{D}/images")
        self._401(client, "DELETE", f"{POINT_ENDPOINT}/{D}/images/{D}")

    # Inventory + item
    def test_inventory_and_item_endpoints(self, client):
        D = DUMMY_ID
        self._401(client, "GET",    f"{INVENTORY_ENDPOINT}/all")
        self._401(client, "GET",    f"{INVENTORY_ENDPOINT}/{D}")
        self._401(client, "POST",   f"{INVENTORY_ENDPOINT}/create")
        self._401(client, "PATCH",  f"{INVENTORY_ENDPOINT}/{D}")
        self._401(client, "DELETE", f"{INVENTORY_ENDPOINT}/{D}")
        self._401(client, "POST",   f"{INVENTORY_ENDPOINT}/{D}/requirements")
        self._401(client, "DELETE", f"{INVENTORY_ENDPOINT}/{D}/requirements/{D}")
        self._401(client, "GET",    f"{ITEM_ENDPOINT}/{D}")
        self._401(client, "POST",   f"{ITEM_ENDPOINT}/create")
        self._401(client, "PATCH",  f"{ITEM_ENDPOINT}/{D}")
        self._401(client, "DELETE", f"{ITEM_ENDPOINT}/{D}")

    # Log
    def test_log_endpoints(self, client):
        D = DUMMY_ID
        self._401(client, "GET",    f"{LOG_ENDPOINT}/all")
        self._401(client, "GET",    f"{LOG_ENDPOINT}/endorsed")
        self._401(client, "POST",   f"{LOG_ENDPOINT}/create")
        self._401(client, "GET",    f"{LOG_ENDPOINT}/{D}")
        self._401(client, "PATCH",  f"{LOG_ENDPOINT}/{D}")
        self._401(client, "DELETE", f"{LOG_ENDPOINT}/{D}")


# ===========================================================================
# §2 — Non-member / non-owner sweep: authenticated outsider must get 403
# ===========================================================================

class TestNonMemberReturns403:
    """
    outsider_headers = a freshly registered user with no relation to any resource.
    auth_headers_2   = user_2, used for resources owned exclusively by user_1.
    """

    def _403(self, client, method, url, outsider_headers, body=None):
        _assert_status(client, method, url, 403, headers=outsider_headers, body=body, label="OUTSIDER")

    # Trip core
    def test_trip_core(self, client, authz_resources, outsider_headers):
        tid = authz_resources["trip_id"]
        self._403(client, "GET",    f"{TRIP_ENDPOINT}/{tid}",           outsider_headers)
        self._403(client, "PATCH",  f"{TRIP_ENDPOINT}/{tid}",           outsider_headers)
        self._403(client, "DELETE", f"{TRIP_ENDPOINT}/{tid}",           outsider_headers)
        self._403(client, "POST",   f"{TRIP_ENDPOINT}/{tid}/state",     outsider_headers)
        self._403(client, "POST",   f"{TRIP_ENDPOINT}/{tid}/invite",    outsider_headers)
        self._403(client, "DELETE", f"{TRIP_ENDPOINT}/{tid}/invite/{DUMMY_ID}", outsider_headers)
        self._403(client, "DELETE", f"{TRIP_ENDPOINT}/{tid}/member/{authz_resources['leader_member_id']}", outsider_headers)

    # GET /api/trip/<user_id>/all and invitations are self-only (service check)
    def test_trip_user_collection_endpoints(self, client, authz_resources, outsider_headers):
        uid = authz_resources["leader_id"]
        self._403(client, "GET", f"{TRIP_ENDPOINT}/{uid}/all",         outsider_headers)
        self._403(client, "GET", f"{TRIP_ENDPOINT}/{uid}/invitations",  outsider_headers)

    # Trip member self-endpoints delegate to service; outsider has no membership → 403/404
    def test_trip_member_me_endpoints(self, client, authz_resources, outsider_headers):
        tid = authz_resources["trip_id"]
        for method, url in [
            ("GET",    f"{TRIP_ENDPOINT}/{tid}/member/me"),
            ("PATCH",  f"{TRIP_ENDPOINT}/{tid}/member/me"),
            ("POST",   f"{TRIP_ENDPOINT}/{tid}/member/me/medical-consent"),
            ("DELETE", f"{TRIP_ENDPOINT}/{tid}/member/me/medical-consent"),
            ("POST",   f"{TRIP_ENDPOINT}/{tid}/member/me/share-medical-notes"),
        ]:
            r = _req(client, method, url, headers=outsider_headers)
            assert r.status_code in (403, 404), (
                f"[OUTSIDER] {method} {url} → {r.status_code}, want 403 or 404"
            )

    # Logistics
    def test_logistics(self, client, authz_resources, outsider_headers):
        tid = authz_resources["trip_id"]
        self._403(client, "GET",  f"{LOGISTICS_ENDPOINT}/{tid}",             outsider_headers)
        self._403(client, "PUT",  f"{LOGISTICS_ENDPOINT}/{tid}",             outsider_headers)
        self._403(client, "POST", f"{LOGISTICS_ENDPOINT}/{tid}/share",       outsider_headers)
        self._403(client, "POST", f"{LOGISTICS_ENDPOINT}/{tid}/share/email", outsider_headers)

    # Travel documents
    def test_travel_documents(self, client, authz_resources, outsider_headers):
        tid = authz_resources["trip_id"]
        did = authz_resources["doc_id"]
        self._403(client, "GET",    f"{TRAVEL_DOCUMENT_ENDPOINT}/{tid}/all",      outsider_headers)
        self._403(client, "POST",   f"{TRAVEL_DOCUMENT_ENDPOINT}/{tid}/create",   outsider_headers)
        self._403(client, "PATCH",  f"{TRAVEL_DOCUMENT_ENDPOINT}/{did}",          outsider_headers)
        self._403(client, "DELETE", f"{TRAVEL_DOCUMENT_ENDPOINT}/{did}",          outsider_headers)
        self._403(client, "POST",   f"{TRAVEL_DOCUMENT_ENDPOINT}/{did}/attachment", outsider_headers)
        self._403(client, "DELETE", f"{TRAVEL_DOCUMENT_ENDPOINT}/{did}/attachment", outsider_headers)
        self._403(client, "GET",    f"{TRAVEL_DOCUMENT_ENDPOINT}/{did}/attachment", outsider_headers)

    # Shuttle
    def test_shuttle(self, client, authz_resources, outsider_headers):
        tid = authz_resources["trip_id"]
        vid = authz_resources["vehicle_id"]
        self._403(client, "GET",    f"{SHUTTLE_ENDPOINT}/{tid}/all",              outsider_headers)
        self._403(client, "POST",   f"{SHUTTLE_ENDPOINT}/{tid}/create",           outsider_headers)
        self._403(client, "PATCH",  f"{SHUTTLE_ENDPOINT}/vehicle/{vid}",          outsider_headers)
        self._403(client, "DELETE", f"{SHUTTLE_ENDPOINT}/vehicle/{vid}",          outsider_headers)
        self._403(client, "POST",   f"{SHUTTLE_ENDPOINT}/vehicle/{vid}/passenger", outsider_headers)
        self._403(client, "DELETE", f"{SHUTTLE_ENDPOINT}/vehicle/{vid}/passenger/{DUMMY_ID}", outsider_headers)

    # Itinerary + day + point
    def test_itinerary_day_point(self, client, authz_resources, outsider_headers):
        iid = authz_resources["itinerary_id"]
        tid = authz_resources["trip_id"]
        day_id = authz_resources["day_id"]
        pid = authz_resources["point_id"]

        # Itinerary (private — is_public=False on this fixture)
        self._403(client, "GET",    f"{ITINERARY_ENDPOINT}/{iid}",         outsider_headers)
        self._403(client, "PATCH",  f"{ITINERARY_ENDPOINT}/{iid}",         outsider_headers)
        self._403(client, "DELETE", f"{ITINERARY_ENDPOINT}/{iid}",         outsider_headers)
        self._403(client, "POST",   f"{ITINERARY_ENDPOINT}/create",        outsider_headers, body={"tripId": tid})

        # Day
        self._403(client, "GET",    f"{DAY_ENDPOINT}/itinerary/{iid}",     outsider_headers)
        self._403(client, "GET",    f"{DAY_ENDPOINT}/{day_id}",            outsider_headers)
        self._403(client, "PATCH",  f"{DAY_ENDPOINT}/{day_id}",            outsider_headers)
        self._403(client, "DELETE", f"{DAY_ENDPOINT}/{day_id}",            outsider_headers)
        # POST /api/day/create excluded: DayService.create_day expects a Day model
        # but the resource passes the raw dict — pre-existing bug causes 500 before authz fires.

        # Point
        self._403(client, "GET",    f"{POINT_ENDPOINT}/{pid}",             outsider_headers)
        self._403(client, "PATCH",  f"{POINT_ENDPOINT}/{pid}",             outsider_headers)
        self._403(client, "DELETE", f"{POINT_ENDPOINT}/{pid}",             outsider_headers)
        self._403(client, "POST",   f"{POINT_ENDPOINT}/create",            outsider_headers, body={"dayId": day_id})

    # Inventory + item — ownership is personal, user_2 (auth_headers_2) does not own them
    def test_personal_inventory_and_item(self, client, authz_resources, auth_headers_2):
        inv_id = authz_resources["personal_inv_id"]
        item_id = authz_resources["item_id"]
        self._403(client, "GET",    f"{INVENTORY_ENDPOINT}/{inv_id}",  auth_headers_2)
        self._403(client, "PATCH",  f"{INVENTORY_ENDPOINT}/{inv_id}",  auth_headers_2)
        self._403(client, "DELETE", f"{INVENTORY_ENDPOINT}/{inv_id}",  auth_headers_2)
        self._403(client, "GET",    f"{ITEM_ENDPOINT}/{item_id}",       auth_headers_2)
        self._403(client, "PATCH",  f"{ITEM_ENDPOINT}/{item_id}",       auth_headers_2)
        self._403(client, "DELETE", f"{ITEM_ENDPOINT}/{item_id}",       auth_headers_2)

    # Log — owner-only; user_2 does not own user_1's log
    def test_log_owner_boundary(self, client, authz_resources, auth_headers_2):
        log_id = authz_resources["log_id"]
        self._403(client, "GET",    f"{LOG_ENDPOINT}/{log_id}", auth_headers_2)
        self._403(client, "PATCH",  f"{LOG_ENDPOINT}/{log_id}", auth_headers_2)
        self._403(client, "DELETE", f"{LOG_ENDPOINT}/{log_id}", auth_headers_2)

    # User profile — self-only via @require_self
    def test_user_profile_self_only(self, client, authz_resources, auth_headers_2):
        uid = authz_resources["leader_id"]
        self._403(client, "GET",    f"{USER_ENDPOINT}/{uid}", auth_headers_2)
        self._403(client, "PATCH",  f"{USER_ENDPOINT}/{uid}", auth_headers_2)

    # DELETE /api/user/<id> is admin-only — any non-admin gets 403
    def test_delete_user_requires_admin(self, client, authz_resources, auth_headers_2):
        uid = authz_resources["leader_id"]
        self._403(client, "DELETE", f"{USER_ENDPOINT}/{uid}", auth_headers_2)


# ===========================================================================
# §3 — Leader-only sweep: crew member must get 403 on @require_leader endpoints
# ===========================================================================

class TestCrewBlockedOnLeaderActions:
    """user_2 is crew on the trip — must be rejected from all leader-only actions."""

    def _403(self, client, method, url, crew_headers, body=None):
        _assert_status(client, method, url, 403, headers=crew_headers, body=body, label="CREW")

    def test_trip_leader_actions(self, client, authz_resources, auth_headers_2):
        tid = authz_resources["trip_id"]
        mid = authz_resources["leader_member_id"]
        crew = auth_headers_2

        self._403(client, "POST",   f"{TRIP_ENDPOINT}/{tid}/state",           crew)
        self._403(client, "POST",   f"{TRIP_ENDPOINT}/{tid}/invite",          crew)
        self._403(client, "DELETE", f"{TRIP_ENDPOINT}/{tid}",                 crew)
        self._403(client, "DELETE", f"{TRIP_ENDPOINT}/{tid}/invite/{DUMMY_ID}", crew)
        self._403(client, "DELETE", f"{TRIP_ENDPOINT}/{tid}/member/{mid}",    crew)

    def test_float_plan_leader_actions(self, client, authz_resources, auth_headers_2):
        tid = authz_resources["trip_id"]
        crew = auth_headers_2

        self._403(client, "POST", f"{LOGISTICS_ENDPOINT}/{tid}/share",       crew)
        self._403(client, "POST", f"{LOGISTICS_ENDPOINT}/{tid}/share/email", crew)

    def test_leader_medical_notes_read(self, client, authz_resources, auth_headers_2):
        tid = authz_resources["trip_id"]
        mid = authz_resources["leader_member_id"]
        crew = auth_headers_2

        # Only the leader can read another member's medical notes
        r = _req(client, "POST", f"{TRIP_ENDPOINT}/{tid}/member/{mid}/medical-notes", headers=crew)
        assert r.status_code in (403, 400), (
            f"[CREW] POST /member/{mid}/medical-notes → {r.status_code}, want 403 or 400"
        )


# ===========================================================================
# §4 — A 403 status must not carry the resource in its body
# ===========================================================================
#
# `_assert_status` above (and by extension every sweep test) only checks the
# status code — appropriate for sweeping ~100 endpoints, but a decorator that
# fires after a fetch would still "pass" that sweep while leaking data in the
# denial body. `@require_owner`/`@require_leader` are `abort()`-based, so they
# short-circuit before the view (and any DB fetch it would do) runs at all —
# assert that directly on a representative GET per resource family, so a
# future refactor that moves the check after a fetch breaks a test instead of
# shipping a leak.
class TestNoDataLeaksInDenialBody:

    def test_trip_403_body_has_no_trip_fields(self, client, authz_resources, outsider_headers):
        tid = authz_resources["trip_id"]
        r = client.get(f"{TRIP_ENDPOINT}/{tid}", headers=outsider_headers)
        assert r.status_code == 403
        body = json.loads(r.data)
        assert "destination" not in body
        assert "itinerary" not in body
        assert "inventory" not in body

    def test_itinerary_403_body_has_no_route_fields(self, client, authz_resources, outsider_headers):
        iid = authz_resources["itinerary_id"]
        r = client.get(f"{ITINERARY_ENDPOINT}/{iid}", headers=outsider_headers)
        assert r.status_code == 403
        body = json.loads(r.data)
        assert "days" not in body
        assert "isPublic" not in body

    def test_logistics_403_body_has_no_shore_contact_fields(self, client, authz_resources, outsider_headers):
        tid = authz_resources["trip_id"]
        r = client.get(f"{LOGISTICS_ENDPOINT}/{tid}", headers=outsider_headers)
        assert r.status_code == 403
        body = json.loads(r.data)
        assert "shoreContactName" not in body
        assert "shoreContactEmail" not in body
        assert "shoreContactPhone" not in body

    def test_log_403_body_has_no_log_fields(self, client, authz_resources, auth_headers_2):
        log_id = authz_resources["log_id"]
        r = client.get(f"{LOG_ENDPOINT}/{log_id}", headers=auth_headers_2)
        assert r.status_code == 403
        body = json.loads(r.data)
        assert "hours" not in body
        assert "notes" not in body
        assert "distance" not in body

    def test_personal_inventory_403_body_has_no_item_fields(self, client, authz_resources, auth_headers_2):
        inv_id = authz_resources["personal_inv_id"]
        r = client.get(f"{INVENTORY_ENDPOINT}/{inv_id}", headers=auth_headers_2)
        assert r.status_code == 403
        body = json.loads(r.data)
        assert "items" not in body
        assert "requirements" not in body
