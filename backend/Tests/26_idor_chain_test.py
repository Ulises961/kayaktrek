"""
IDOR ownership chain — S3.

Verifies that require_owner (and the equivalent inline g.current_user_id guards)
blocks every resource type from unauthorized callers — regardless of knowing the ID.

Domain entities and their HTTP exposure
----------------------------------------
trip          → /api/trip/<id>                            (authz_matrix S1)
itinerary     → /api/itinerary/<id>                       ← §1 §2
day           → /api/day/<id>                             ← §1 §2
point         → /api/point/<id>                           ← §1 §2
image         → /api/point/<id>/images/<image_id>         ← §1 §2 (auth fires on point_id)
sea           → no dedicated endpoint; inside GET /api/day/<id> — day IDOR covers it
weather       → same as sea
sea_state     → same as sea
weather_state → same as sea
inventory     → /api/inventory/<id>                       ← §1 §2 (trip + personal)
item          → /api/item/<id>                            ← §1 §2 §3 (personal + trip-inventory)
travel_doc    → /api/travel-document/<id>                 ← §1 §2
shuttle_veh   → /api/shuttle/vehicle/<id>                 ← §1 §2
logistics     → /api/logistics/<trip_id>                  (require_owner("trip") — S1)
log           → /api/log/<id>                             ← §3
user profile  → /api/user/<id>                            ← §3 (require_self)
trip list     → /api/trip/<user_id>/all                   ← §3 (inline g.current_user_id guard)
invitations   → /api/trip/<user_id>/invitations           ← §3 (inline g.current_user_id guard)
medical notes → /api/trip/<id>/member/<mid>/medical-notes ← §3 (require_elevated_token + leader-only)
log endorse   → endorsements are read-only via GET /api/log/endorsed (uses g.current_user_id — no IDOR surface)

Three actor columns
-------------------
§1  Outsider    — authenticated, no relation to the resource at all.
§2  Cross-trip  — user_2 is crew of trip_A only; tries to reach trip_B resources.
§3  Cross-user  — user_2 tries to reach user_1's personal resources (logs, profile, trip list).

Fixture topology
----------------
trip_A : user_1 (leader), user_2 (crew)
         ├─ private itinerary_a
         │   └─ day_a → point_a
         ├─ trip inventory_a → trip_item_a (owner: user_1)
         ├─ doc_a (travel document)
         └─ vehicle_a (shuttle)
         TripMember: leader_member_id (user_1), crew_member_id (user_2)
trip_B : user_1 (leader only — user_2 has NO membership)
         ├─ private itinerary_b
         │   └─ day_b → point_b
         ├─ trip inventory_b → trip_item_b (owner: user_1)
         ├─ doc_b (travel document)
         └─ vehicle_b (shuttle)
user_1 personal:
         personal_inv → personal_item
         log_a (paddling log owned by user_1)
"""
import json

import pytest

from Resources.day_resource import DAY_ENDPOINT
from Resources.inventory_resource import INVENTORY_ENDPOINT
from Resources.item_resource import ITEM_ENDPOINT
from Resources.itinerary_resource import ITINERARY_ENDPOINT
from Resources.log_resource import LOG_ENDPOINT
from Resources.point_resource import POINT_ENDPOINT
from Resources.shuttle_resource import SHUTTLE_ENDPOINT
from Resources.travel_document_resource import TRAVEL_DOCUMENT_ENDPOINT
from Resources.trip_resource import TRIP_ENDPOINT
from Resources.user_resource import USER_ENDPOINT

DUMMY_ID = "01900000-0000-7000-8000-000000000099"


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def _assert(client, method, url, expected, headers, body=None, label=""):
    kwargs = {"headers": headers}
    if body is not None:
        kwargs["json"] = body
    r = getattr(client, method.lower())(url, **kwargs)
    assert r.status_code == expected, (
        f"[{label}] {method} {url} → {r.status_code}, want {expected}. body={r.data}"
    )


# ---------------------------------------------------------------------------
# Fixture
# ---------------------------------------------------------------------------

@pytest.fixture(scope="function")
def idor_resources(client, auth_headers, auth_headers_2, user_1, user_2, category_ids):
    """
    Two fully-populated trips. user_2 is crew of trip_A only.
    Every resource type that has dedicated IDOR endpoints is represented.
    """

    def _make_trip(headers):
        r = client.post(
            f"{TRIP_ENDPOINT}/create",
            json={
                "inventory": {},
                "itinerary": {
                    "isPublic": False,
                    "totalMiles": 0,
                    "days": [{"dayNumber": 1, "date": "2026-09-01", "points": []}],
                },
            },
            headers=headers,
        )
        assert r.status_code == 201, r.data
        d = json.loads(r.data)
        return (
            d["id"],
            d["itinerary"]["id"],
            d["itinerary"]["days"][0]["id"],
            d["inventory"]["id"],
        )

    trip_a_id, itin_a_id, day_a_id, inv_a_id = _make_trip(auth_headers)
    trip_b_id, itin_b_id, day_b_id, inv_b_id = _make_trip(auth_headers)

    # user_2 joins trip_A only
    r = client.post(f"{TRIP_ENDPOINT}/{trip_a_id}/invite", json={"userId": str(user_2.id)}, headers=auth_headers)
    assert r.status_code == 201, r.data
    r = client.post(f"{TRIP_ENDPOINT}/{trip_a_id}/invitation", json={"accepted": True}, headers=auth_headers_2)
    assert r.status_code == 200, r.data

    # Resolve member IDs
    r = client.get(f"{TRIP_ENDPOINT}/{trip_a_id}/member/me", headers=auth_headers)
    assert r.status_code == 200, r.data
    leader_member_id = json.loads(r.data)["id"]

    r = client.get(f"{TRIP_ENDPOINT}/{trip_a_id}/member/me", headers=auth_headers_2)
    assert r.status_code == 200, r.data
    crew_member_id = json.loads(r.data)["id"]

    def _make_point(day_id, headers):
        r = client.post(
            f"{POINT_ENDPOINT}/create",
            json={"dayId": day_id, "type": "stop", "lat": 44.0, "lon": 9.0, "name": "IDOR Point"},
            headers=headers,
        )
        assert r.status_code == 201, r.data
        return json.loads(r.data)["id"]

    def _make_doc(trip_id, headers):
        r = client.post(
            f"{TRAVEL_DOCUMENT_ENDPOINT}/{trip_id}/create",
            json={"type": "accommodation", "name": "IDOR Doc"},
            headers=headers,
        )
        assert r.status_code == 201, r.data
        return json.loads(r.data)["id"]

    def _make_vehicle(trip_id, headers):
        r = client.post(
            f"{SHUTTLE_ENDPOINT}/{trip_id}/create",
            json={"vehicleDescription": "IDOR Van"},
            headers=headers,
        )
        assert r.status_code == 201, r.data
        return json.loads(r.data)["id"]

    def _make_trip_item(inv_id, headers):
        r = client.post(
            f"{ITEM_ENDPOINT}/create",
            json={"inventoryId": inv_id, "categoryId": category_ids["generic"], "name": "IDOR Trip Item"},
            headers=headers,
        )
        assert r.status_code == 201, r.data
        return json.loads(r.data)["id"]

    point_a_id = _make_point(day_a_id, auth_headers)
    point_b_id = _make_point(day_b_id, auth_headers)
    doc_a_id = _make_doc(trip_a_id, auth_headers)
    doc_b_id = _make_doc(trip_b_id, auth_headers)
    vehicle_a_id = _make_vehicle(trip_a_id, auth_headers)
    vehicle_b_id = _make_vehicle(trip_b_id, auth_headers)
    trip_item_a_id = _make_trip_item(inv_a_id, auth_headers)
    trip_item_b_id = _make_trip_item(inv_b_id, auth_headers)

    # user_1's personal inventory + item
    r = client.post(f"{INVENTORY_ENDPOINT}/create", json={}, headers=auth_headers)
    assert r.status_code == 201, r.data
    personal_inv_id = json.loads(r.data)["id"]

    r = client.post(
        f"{ITEM_ENDPOINT}/create",
        json={"inventoryId": personal_inv_id, "categoryId": category_ids["generic"], "name": "IDOR Personal Item"},
        headers=auth_headers,
    )
    assert r.status_code == 201, r.data
    personal_item_id = json.loads(r.data)["id"]

    # user_1's paddling log
    r = client.post(f"{LOG_ENDPOINT}/create", json={"hours": 2, "avgSea": 1}, headers=auth_headers)
    assert r.status_code == 201, r.data
    log_a_id = json.loads(r.data)["id"]

    yield {
        "user_1_id": str(user_1.id),
        "user_2_id": str(user_2.id),
        "trip_a_id": trip_a_id,
        "trip_b_id": trip_b_id,
        "itin_a_id": itin_a_id,
        "itin_b_id": itin_b_id,
        "day_a_id": day_a_id,
        "day_b_id": day_b_id,
        "inv_a_id": inv_a_id,
        "inv_b_id": inv_b_id,
        "point_a_id": point_a_id,
        "point_b_id": point_b_id,
        "doc_a_id": doc_a_id,
        "doc_b_id": doc_b_id,
        "vehicle_a_id": vehicle_a_id,
        "vehicle_b_id": vehicle_b_id,
        "trip_item_a_id": trip_item_a_id,
        "trip_item_b_id": trip_item_b_id,
        "personal_inv_id": personal_inv_id,
        "personal_item_id": personal_item_id,
        "log_a_id": log_a_id,
        "leader_member_id": leader_member_id,
        "crew_member_id": crew_member_id,
    }

    client.delete(f"{TRIP_ENDPOINT}/{trip_a_id}", headers=auth_headers)
    client.delete(f"{TRIP_ENDPOINT}/{trip_b_id}", headers=auth_headers)
    try:
        client.delete(f"{INVENTORY_ENDPOINT}/{personal_inv_id}", headers=auth_headers)
    except Exception:
        pass
    try:
        client.delete(f"{LOG_ENDPOINT}/{log_a_id}", headers=auth_headers)
    except Exception:
        pass


# ---------------------------------------------------------------------------
# §1 — Outsider IDOR
# Authenticated user with NO relation to any of these resources.
# ---------------------------------------------------------------------------

def test_outsider_idor(client, outsider_headers, idor_resources):
    """
    §1: Outsider cannot read or mutate any sub-resource of trip_A,
    regardless of knowing the exact IDs.
    """
    r = idor_resources
    cases = [
        # itinerary
        ("GET",    f"{ITINERARY_ENDPOINT}/{r['itin_a_id']}",                        None,               "get_itin"),
        ("PATCH",  f"{ITINERARY_ENDPOINT}/{r['itin_a_id']}",                        {"totalMiles": 1},  "patch_itin"),
        ("DELETE", f"{ITINERARY_ENDPOINT}/{r['itin_a_id']}",                        None,               "delete_itin"),
        # day (sea/weather/states are embedded — day IDOR covers them)
        ("GET",    f"{DAY_ENDPOINT}/{r['day_a_id']}",                               None,               "get_day"),
        ("PATCH",  f"{DAY_ENDPOINT}/{r['day_a_id']}",                               {"dayNumber": 99},  "patch_day"),
        # point
        ("GET",    f"{POINT_ENDPOINT}/{r['point_a_id']}",                           None,               "get_point"),
        ("PATCH",  f"{POINT_ENDPOINT}/{r['point_a_id']}",                           {"name": "pwned"},  "patch_point"),
        # image sub-resource — require_owner fires on point_id before image_id is used
        ("POST",   f"{POINT_ENDPOINT}/{r['point_a_id']}/images",                    None,               "upload_image"),
        ("DELETE", f"{POINT_ENDPOINT}/{r['point_a_id']}/images/{DUMMY_ID}",         None,               "delete_image"),
        # trip inventory
        ("GET",    f"{INVENTORY_ENDPOINT}/{r['inv_a_id']}",                         None,               "get_trip_inv"),
        ("PATCH",  f"{INVENTORY_ENDPOINT}/{r['inv_a_id']}",                         {"name": "pwned"},  "patch_trip_inv"),
        # items: personal and trip-inventory
        ("GET",    f"{ITEM_ENDPOINT}/{r['personal_item_id']}",                      None,               "get_personal_item"),
        ("PATCH",  f"{ITEM_ENDPOINT}/{r['personal_item_id']}",                      {"name": "pwned"},  "patch_personal_item"),
        ("GET",    f"{ITEM_ENDPOINT}/{r['trip_item_a_id']}",                        None,               "get_trip_item"),
        ("PATCH",  f"{ITEM_ENDPOINT}/{r['trip_item_a_id']}",                        {"name": "pwned"},  "patch_trip_item"),
        # travel document
        ("GET",    f"{TRAVEL_DOCUMENT_ENDPOINT}/{r['doc_a_id']}/attachment",        None,               "get_doc_attachment"),
        ("PATCH",  f"{TRAVEL_DOCUMENT_ENDPOINT}/{r['doc_a_id']}",                   {"name": "pwned"},  "patch_doc"),
        # shuttle vehicle
        ("PATCH",  f"{SHUTTLE_ENDPOINT}/vehicle/{r['vehicle_a_id']}",               {"vehicleDescription": "pwned"}, "patch_vehicle"),
        # medical notes: require_elevated_token fires first (no elevated token → 403)
        ("POST",   f"{TRIP_ENDPOINT}/{r['trip_a_id']}/member/{r['leader_member_id']}/medical-notes",
                   {"password": "x"}, "get_medical_notes"),
        # DELETE operations last — would destroy resources needed by assertions above
        ("DELETE", f"{POINT_ENDPOINT}/{r['point_a_id']}",                           None,               "delete_point"),
        ("DELETE", f"{TRAVEL_DOCUMENT_ENDPOINT}/{r['doc_a_id']}",                   None,               "delete_doc"),
        ("DELETE", f"{SHUTTLE_ENDPOINT}/vehicle/{r['vehicle_a_id']}",               None,               "delete_vehicle"),
        ("DELETE", f"{INVENTORY_ENDPOINT}/{r['inv_a_id']}",                         None,               "delete_trip_inv"),
    ]
    for method, url, body, label in cases:
        _assert(client, method, url, 403, outsider_headers, body=body, label=label)


# ---------------------------------------------------------------------------
# §2 — Cross-trip IDOR
# user_2 is a legitimate crew member of trip_A — must not reach trip_B resources.
# ---------------------------------------------------------------------------

def test_cross_trip_idor(client, auth_headers_2, idor_resources):
    """
    §2: Crew membership in trip_A grants no access to trip_B's resources.
    user_2 knows all IDs but is not a member of trip_B.
    """
    r = idor_resources
    cases = [
        # itinerary
        ("GET",    f"{ITINERARY_ENDPOINT}/{r['itin_b_id']}",                        None,               "get_itin_b"),
        ("PATCH",  f"{ITINERARY_ENDPOINT}/{r['itin_b_id']}",                        {"totalMiles": 1},  "patch_itin_b"),
        ("DELETE", f"{ITINERARY_ENDPOINT}/{r['itin_b_id']}",                        None,               "delete_itin_b"),
        # day (sea/weather/states are embedded — day IDOR covers them)
        ("GET",    f"{DAY_ENDPOINT}/{r['day_b_id']}",                               None,               "get_day_b"),
        ("PATCH",  f"{DAY_ENDPOINT}/{r['day_b_id']}",                               {"dayNumber": 99},  "patch_day_b"),
        # point
        ("GET",    f"{POINT_ENDPOINT}/{r['point_b_id']}",                           None,               "get_point_b"),
        ("PATCH",  f"{POINT_ENDPOINT}/{r['point_b_id']}",                           {"name": "pwned"},  "patch_point_b"),
        # image sub-resource
        ("POST",   f"{POINT_ENDPOINT}/{r['point_b_id']}/images",                    None,               "upload_image_b"),
        ("DELETE", f"{POINT_ENDPOINT}/{r['point_b_id']}/images/{DUMMY_ID}",         None,               "delete_image_b"),
        # trip inventory
        ("GET",    f"{INVENTORY_ENDPOINT}/{r['inv_b_id']}",                         None,               "get_trip_inv_b"),
        ("PATCH",  f"{INVENTORY_ENDPOINT}/{r['inv_b_id']}",                         {"name": "pwned"},  "patch_trip_inv_b"),
        # items in trip_B (owned by user_1, user_2 is neither owner nor member of B)
        ("GET",    f"{ITEM_ENDPOINT}/{r['trip_item_b_id']}",                        None,               "get_trip_item_b"),
        ("PATCH",  f"{ITEM_ENDPOINT}/{r['trip_item_b_id']}",                        {"name": "pwned"},  "patch_trip_item_b"),
        # travel document
        ("GET",    f"{TRAVEL_DOCUMENT_ENDPOINT}/{r['doc_b_id']}/attachment",        None,               "get_doc_b_attachment"),
        ("PATCH",  f"{TRAVEL_DOCUMENT_ENDPOINT}/{r['doc_b_id']}",                   {"name": "pwned"},  "patch_doc_b"),
        # shuttle vehicle
        ("PATCH",  f"{SHUTTLE_ENDPOINT}/vehicle/{r['vehicle_b_id']}",               {"vehicleDescription": "pwned"}, "patch_vehicle_b"),
        # user_1's personal item (owner check, not trip membership)
        ("GET",    f"{ITEM_ENDPOINT}/{r['personal_item_id']}",                      None,               "get_personal_item_cross"),
        ("PATCH",  f"{ITEM_ENDPOINT}/{r['personal_item_id']}",                      {"name": "pwned"},  "patch_personal_item_cross"),
        # crew reading another crew member's medical notes (not leader → 403 from service;
        # but require_elevated_token fires first with a plain JWT)
        ("POST",   f"{TRIP_ENDPOINT}/{r['trip_a_id']}/member/{r['crew_member_id']}/medical-notes",
                   {"password": "x"}, "crew_reads_medical_notes"),
        # DELETE operations last
        ("DELETE", f"{POINT_ENDPOINT}/{r['point_b_id']}",                           None,               "delete_point_b"),
        ("DELETE", f"{TRAVEL_DOCUMENT_ENDPOINT}/{r['doc_b_id']}",                   None,               "delete_doc_b"),
        ("DELETE", f"{SHUTTLE_ENDPOINT}/vehicle/{r['vehicle_b_id']}",               None,               "delete_vehicle_b"),
        ("DELETE", f"{INVENTORY_ENDPOINT}/{r['inv_b_id']}",                         None,               "delete_trip_inv_b"),
    ]
    for method, url, body, label in cases:
        _assert(client, method, url, 403, auth_headers_2, body=body, label=label)


# ---------------------------------------------------------------------------
# §3 — Cross-user IDOR
# user_2 targets user_1's personal resources: logs, profile, trip list.
# ---------------------------------------------------------------------------

def test_cross_user_idor(client, auth_headers_2, idor_resources):
    """
    §3: user_2 cannot read or mutate user_1's personal/profile resources,
    even though both are authenticated.
    """
    r = idor_resources
    uid1 = r["user_1_id"]
    cases = [
        # Log — owned by user_1; require_owner('log') checks log.user_id
        ("GET",    f"{LOG_ENDPOINT}/{r['log_a_id']}",                               None,               "get_log"),
        ("PATCH",  f"{LOG_ENDPOINT}/{r['log_a_id']}",                               {"hours": 99},      "patch_log"),
        ("DELETE", f"{LOG_ENDPOINT}/{r['log_a_id']}",                               None,               "delete_log"),
        # User profile — protected by @require_self (user can only access own profile)
        ("GET",    f"{USER_ENDPOINT}/{uid1}",                                        None,               "get_profile"),
        ("PATCH",  f"{USER_ENDPOINT}/{uid1}",                                        {"name": "pwned"},  "patch_profile"),
        # Trip list — inline g.current_user_id guard (not @require_self, still checked)
        ("GET",    f"{TRIP_ENDPOINT}/{uid1}/all",                                    None,               "get_trip_list"),
        # Invitations list — same inline guard
        ("GET",    f"{TRIP_ENDPOINT}/{uid1}/invitations",                            None,               "get_invitations"),
    ]
    for method, url, body, label in cases:
        _assert(client, method, url, 403, auth_headers_2, body=body, label=label)
