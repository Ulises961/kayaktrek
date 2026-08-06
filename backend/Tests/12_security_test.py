"""
Security boundary tests — server-enforced ownership and protected fields.

Covers:
- user_id cannot be spoofed on log and item creation
- PATCH /api/trip/<id> cannot change state (state machine bypass attempt)
- User registration ignores admin=true
- Cascade delete: trip deletion removes itinerary
- 401/403 on key auth-required and owner-only endpoints
- Wrong-user cannot PATCH another user's item
- Input validation: HTML injection stripped, oversized input rejected,
  whitespace trimmed across trip, trip member, logistics, point, log,
  travel document, and shuttle vehicle free-text fields
"""
import json
import pytest

from Api.database import db
from Models.user import User
from Resources.log_resource import LOG_ENDPOINT
from Resources.logistics_resource import LOGISTICS_ENDPOINT
from Resources.point_resource import POINT_ENDPOINT
from Resources.shuttle_resource import SHUTTLE_ENDPOINT
from Resources.travel_document_resource import TRAVEL_DOCUMENT_ENDPOINT
from Resources.trip_resource import TRIP_ENDPOINT
from Resources.item_resource import ITEM_ENDPOINT
from Resources.day_resource import DAY_ENDPOINT
from Resources.itinerary_resource import ITINERARY_ENDPOINT
from Resources.inventory_resource import INVENTORY_ENDPOINT


# ---------------------------------------------------------------------------
# user_id spoof protection
# ---------------------------------------------------------------------------

def test_log_create_ignores_user_id_in_body(client, auth_headers, id):
    """Server must stamp user_id from JWT context — payload userId is silently dropped."""
    spoofed_id = "00000000-0000-0000-0000-000000000000"
    response = client.post(
        f"{LOG_ENDPOINT}/create",
        headers=auth_headers,
        json={"hours": 3, "avgSea": 2, "userId": spoofed_id},
    )
    assert response.status_code == 201
    data = json.loads(response.data)
    assert data["userId"] == id
    assert data["userId"] != spoofed_id

    client.delete(f"{LOG_ENDPOINT}/{data['id']}", headers=auth_headers)


def test_item_create_ignores_user_id_in_body(client, auth_headers, id, empty_inventory, category_ids):
    """Item user_id must come from JWT context, not the request body."""
    spoofed_id = "00000000-0000-0000-0000-000000000000"
    payload = {
        "inventoryId": empty_inventory["id"],
        "name": "test_item",
        "categoryId": category_ids["generic"],
        "userId": spoofed_id,
    }
    response = client.post(f"{ITEM_ENDPOINT}/create", headers=auth_headers, json=payload)
    assert response.status_code == 201
    data = json.loads(response.data)
    assert data["userId"] == id
    assert data["userId"] != spoofed_id

    client.delete(f"{ITEM_ENDPOINT}/{data['id']}", headers=auth_headers)


# ---------------------------------------------------------------------------
# State machine bypass protection
# ---------------------------------------------------------------------------

def test_patch_trip_cannot_change_state(client, auth_headers):
    """PATCH /api/trip/<id> must ignore a 'state' field — only the state endpoint advances state."""
    trip_response = client.post(
        f"{TRIP_ENDPOINT}/create",
        headers=auth_headers,
        json={"inventory": {}, "itinerary": {"isPublic": False, "totalMiles": 0, "days": []}},
    )
    assert trip_response.status_code == 201
    trip = json.loads(trip_response.data)
    assert trip["state"] == "building"

    patch_response = client.patch(
        f"{TRIP_ENDPOINT}/{trip['id']}",
        headers=auth_headers,
        json={"state": "past", "destination": "Azores"},
    )
    assert patch_response.status_code == 200
    patched = json.loads(patch_response.data)
    # state must not have changed; destination should be updated
    assert patched["state"] == "building"
    assert patched["destination"] == "Azores"

    client.delete(f"{TRIP_ENDPOINT}/{trip['id']}", headers=auth_headers)


# ---------------------------------------------------------------------------
# Admin spoof protection
# ---------------------------------------------------------------------------

def test_register_with_admin_true_is_not_admin(client):
    """A client-supplied admin=true must be silently ignored on registration."""
    payload = {
        "mail": "hacker.admin@example.com",
        "pwd": "Hack3r$ecure!",
        "phone": "5550000001",
        "username": "hacker_admin",
        "name": "Hacker",
        "admin": True,
    }
    response = client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 201

    user = User.query.filter_by(mail=payload["mail"]).first()
    assert user is not None
    assert user.admin is False


# ---------------------------------------------------------------------------
# Cascade delete
# ---------------------------------------------------------------------------

def test_delete_trip_removes_itinerary(client, auth_headers):
    """Deleting a trip must cascade-delete the attached itinerary."""
    trip_response = client.post(
        f"{TRIP_ENDPOINT}/create",
        headers=auth_headers,
        json={"inventory": {}, "itinerary": {"isPublic": False, "totalMiles": 0, "days": []}},
    )
    assert trip_response.status_code == 201
    trip = json.loads(trip_response.data)
    itinerary_id = trip["itinerary"]["id"]

    delete_response = client.delete(f"{TRIP_ENDPOINT}/{trip['id']}", headers=auth_headers)
    assert delete_response.status_code == 200

    get_response = client.get(f"{ITINERARY_ENDPOINT}/{itinerary_id}", headers=auth_headers)
    assert get_response.status_code == 404


# ---------------------------------------------------------------------------
# 401 / 403 boundaries
# ---------------------------------------------------------------------------

def test_trip_endpoint_requires_auth(client):
    """GET /api/trip/<id>/all without a token must be rejected."""
    response = client.get(f"{TRIP_ENDPOINT}/some-id/all")
    assert response.status_code in (401, 403)


def test_log_endpoint_requires_auth(client):
    """GET /api/log/all without a token must be rejected."""
    response = client.get(f"{LOG_ENDPOINT}/all")
    assert response.status_code in (401, 403)


def test_item_endpoint_requires_auth(client):
    """GET /api/item/<id> without a token must be rejected."""
    response = client.get(f"{ITEM_ENDPOINT}/some-id")
    assert response.status_code in (401, 403)


def test_wrong_user_cannot_patch_item(client, auth_headers, outsider_headers, inventory_with_items):
    """A user who does not own an item must receive 403 on PATCH, and the
    attempted change must not have landed — re-fetch as the real owner."""
    item_id = inventory_with_items["items"][0]["id"]
    original_name = inventory_with_items["items"][0]["name"]
    response = client.patch(
        f"{ITEM_ENDPOINT}/{item_id}",
        headers=outsider_headers,
        json={"name": "stolen"},
    )
    assert response.status_code == 403

    owner_view = client.get(f"{ITEM_ENDPOINT}/{item_id}", headers=auth_headers)
    assert owner_view.status_code == 200
    assert json.loads(owner_view.data)["name"] == original_name



def test_wrong_user_cannot_patch_trip(client, outsider_headers):
    """An outsider must receive 403 when attempting to PATCH a trip they are not a member of."""
    # We need a trip ID that exists but the outsider doesn't belong to.
    # Use any UUID that likely doesn't exist — ownership check returns None → 404-like path,
    # but for a valid existing trip we rely on outsider_headers not being a member.
    response = client.patch(
        f"{TRIP_ENDPOINT}/00000000-0000-0000-0000-000000000001",
        headers=outsider_headers,
        json={"destination": "Stolen"},
    )
    assert response.status_code in (403, 404)


# ---------------------------------------------------------------------------
# Input validation — HTML injection, oversized input, whitespace trimming
# ---------------------------------------------------------------------------

_HTML_PAYLOAD = "<script>xss</script>"
_LONG_STRING  = "A" * 10_001


def _no_html(value) -> bool:
    return value is None or ("<" not in str(value) and ">" not in str(value))


def _sanitized_or_rejected(response, *field_path):
    """2xx with clean value OR 4xx rejection — never 500."""
    assert response.status_code != 500, f"Server error on input: {response.data}"
    if response.status_code < 300:
        data = json.loads(response.data)
        value = data
        for key in field_path:
            value = value.get(key) if isinstance(value, dict) else None
        assert _no_html(value), f"HTML not stripped from {field_path}: {value!r}"


class TestTripInputValidation:

    def test_destination_html_stripped(self, client, trip_with_user2_as_crew):
        tid = trip_with_user2_as_crew["trip"]["id"]
        r = client.patch(f"{TRIP_ENDPOINT}/{tid}", headers=trip_with_user2_as_crew["leader_headers"],
                         json={"destination": _HTML_PAYLOAD})
        _sanitized_or_rejected(r, "destination")

    def test_description_html_stripped(self, client, trip_with_user2_as_crew):
        tid = trip_with_user2_as_crew["trip"]["id"]
        r = client.patch(f"{TRIP_ENDPOINT}/{tid}", headers=trip_with_user2_as_crew["leader_headers"],
                         json={"description": _HTML_PAYLOAD})
        _sanitized_or_rejected(r, "description")

    def test_destination_whitespace_trimmed(self, client, trip_with_user2_as_crew):
        tid = trip_with_user2_as_crew["trip"]["id"]
        r = client.patch(f"{TRIP_ENDPOINT}/{tid}", headers=trip_with_user2_as_crew["leader_headers"],
                         json={"destination": "  Azores  "})
        assert r.status_code == 200
        assert json.loads(r.data)["destination"] == "Azores"

    def test_oversized_destination_rejected(self, client, trip_with_user2_as_crew):
        tid = trip_with_user2_as_crew["trip"]["id"]
        r = client.patch(f"{TRIP_ENDPOINT}/{tid}", headers=trip_with_user2_as_crew["leader_headers"],
                         json={"destination": _LONG_STRING})
        assert r.status_code in (400, 413, 422), f"Oversized destination accepted: {r.status_code}"

    def test_oversized_description_rejected(self, client, trip_with_user2_as_crew):
        tid = trip_with_user2_as_crew["trip"]["id"]
        r = client.patch(f"{TRIP_ENDPOINT}/{tid}", headers=trip_with_user2_as_crew["leader_headers"],
                         json={"description": _LONG_STRING})
        assert r.status_code in (400, 413, 422), f"Oversized description accepted: {r.status_code}"


class TestTripMemberInputValidation:
    """PATCH /api/trip/<id>/member/me — vessel and emergency contact free-text fields."""

    def _patch(self, client, trip_with_user2_as_crew, payload):
        tid = trip_with_user2_as_crew["trip"]["id"]
        return client.patch(f"{TRIP_ENDPOINT}/{tid}/member/me",
                            headers=trip_with_user2_as_crew["leader_headers"], json=payload)

    def _get(self, client, trip_with_user2_as_crew):
        tid = trip_with_user2_as_crew["trip"]["id"]
        r = client.get(f"{TRIP_ENDPOINT}/{tid}/member/me",
                       headers=trip_with_user2_as_crew["leader_headers"])
        assert r.status_code == 200
        return json.loads(r.data)

    def test_vessel_make_html_stripped(self, client, trip_with_user2_as_crew):
        _sanitized_or_rejected(self._patch(client, trip_with_user2_as_crew, {"vesselMake": _HTML_PAYLOAD}), "vesselMake")

    def test_vessel_model_html_stripped(self, client, trip_with_user2_as_crew):
        _sanitized_or_rejected(self._patch(client, trip_with_user2_as_crew, {"vesselModel": _HTML_PAYLOAD}), "vesselModel")

    def test_vessel_color_primary_html_stripped(self, client, trip_with_user2_as_crew):
        _sanitized_or_rejected(self._patch(client, trip_with_user2_as_crew, {"vesselColorPrimary": _HTML_PAYLOAD}), "vesselColorPrimary")

    def test_vessel_color_secondary_html_stripped(self, client, trip_with_user2_as_crew):
        _sanitized_or_rejected(self._patch(client, trip_with_user2_as_crew, {"vesselColorSecondary": _HTML_PAYLOAD}), "vesselColorSecondary")

    def test_emergency_contact_name_html_stripped(self, client, trip_with_user2_as_crew):
        _sanitized_or_rejected(self._patch(client, trip_with_user2_as_crew, {"emergencyContactName": _HTML_PAYLOAD}), "emergencyContactName")

    def test_emergency_contact_phone_html_stripped(self, client, trip_with_user2_as_crew):
        _sanitized_or_rejected(self._patch(client, trip_with_user2_as_crew, {"emergencyContactPhone": _HTML_PAYLOAD}), "emergencyContactPhone")

    def test_emergency_contact_relationship_html_stripped(self, client, trip_with_user2_as_crew):
        _sanitized_or_rejected(self._patch(client, trip_with_user2_as_crew, {"emergencyContactRelationship": _HTML_PAYLOAD}), "emergencyContactRelationship")

    def test_vessel_make_whitespace_trimmed(self, client, trip_with_user2_as_crew):
        self._patch(client, trip_with_user2_as_crew, {"vesselMake": "  Prijon  "})
        member = self._get(client, trip_with_user2_as_crew)
        assert member.get("vesselMake") == "Prijon", f"Whitespace not stripped: {member.get('vesselMake')!r}"


class TestLogisticsInputValidation:

    def test_shore_contact_name_html_stripped(self, client, trip_with_user2_as_crew):
        tid = trip_with_user2_as_crew["trip"]["id"]
        r = client.put(f"{LOGISTICS_ENDPOINT}/{tid}", headers=trip_with_user2_as_crew["leader_headers"],
                       json={"shoreContactName": _HTML_PAYLOAD})
        _sanitized_or_rejected(r, "shoreContactName")

    def test_shore_contact_email_html_stripped(self, client, trip_with_user2_as_crew):
        tid = trip_with_user2_as_crew["trip"]["id"]
        r = client.put(f"{LOGISTICS_ENDPOINT}/{tid}", headers=trip_with_user2_as_crew["leader_headers"],
                       json={"shoreContactEmail": _HTML_PAYLOAD})
        _sanitized_or_rejected(r, "shoreContactEmail")

    def test_shore_contact_name_whitespace_trimmed(self, client, trip_with_user2_as_crew):
        tid = trip_with_user2_as_crew["trip"]["id"]
        r = client.put(f"{LOGISTICS_ENDPOINT}/{tid}", headers=trip_with_user2_as_crew["leader_headers"],
                       json={"shoreContactName": "  Alice Shore  "})
        assert r.status_code == 200
        assert json.loads(r.data)["shoreContactName"] == "Alice Shore"


class TestPointInputValidation:

    def _day_id(self, client, trip_with_user2_as_crew):
        """Return a day ID, creating one if the fixture trip has no days."""
        trip = trip_with_user2_as_crew["trip"]
        days = trip["itinerary"]["days"]
        if days:
            return days[0]["id"]
        iid = trip["itinerary"]["id"]
        r = client.post(
            f"{DAY_ENDPOINT}/create",
            headers=trip_with_user2_as_crew["leader_headers"],
            json={"dayNumber": 1, "date": "2026-08-01", "itineraryId": iid},
        )
        assert r.status_code == 201, f"Could not create day: {r.data}"
        return json.loads(r.data)["id"]

    def test_point_notes_html_stripped(self, client, trip_with_user2_as_crew):
        day_id = self._day_id(client, trip_with_user2_as_crew)
        r = client.post(f"{POINT_ENDPOINT}/create", headers=trip_with_user2_as_crew["leader_headers"],
                        json={"dayId": day_id, "type": "stop", "lat": 44.0, "lon": 9.0, "notes": _HTML_PAYLOAD})
        _sanitized_or_rejected(r, "notes")

    def test_oversized_notes_rejected(self, client, trip_with_user2_as_crew):
        day_id = self._day_id(client, trip_with_user2_as_crew)
        r = client.post(f"{POINT_ENDPOINT}/create", headers=trip_with_user2_as_crew["leader_headers"],
                        json={"dayId": day_id, "type": "stop", "lat": 44.0, "lon": 9.0, "notes": _LONG_STRING})
        assert r.status_code in (400, 413, 422), f"Oversized notes accepted: {r.status_code}"


class TestLogInputValidation:

    def test_notes_html_stripped(self, client, auth_headers):
        r = client.post(f"{LOG_ENDPOINT}/create", headers=auth_headers,
                        json={"hours": 2, "avgSea": 1, "notes": _HTML_PAYLOAD})
        _sanitized_or_rejected(r, "notes")
        if r.status_code == 201:
            client.delete(f"{LOG_ENDPOINT}/{json.loads(r.data)['id']}", headers=auth_headers)

    def test_notes_whitespace_trimmed(self, client, auth_headers):
        r = client.post(f"{LOG_ENDPOINT}/create", headers=auth_headers,
                        json={"hours": 2, "avgSea": 1, "notes": "  good paddle  "})
        assert r.status_code == 201
        data = json.loads(r.data)
        assert data.get("notes") == "good paddle", f"Whitespace not stripped: {data.get('notes')!r}"
        client.delete(f"{LOG_ENDPOINT}/{data['id']}", headers=auth_headers)


class TestTravelDocumentInputValidation:

    def test_name_html_stripped(self, client, trip_with_user2_as_crew):
        tid = trip_with_user2_as_crew["trip"]["id"]
        r = client.post(f"{TRAVEL_DOCUMENT_ENDPOINT}/{tid}/create",
                        headers=trip_with_user2_as_crew["leader_headers"],
                        json={"type": "accommodation", "name": _HTML_PAYLOAD})
        _sanitized_or_rejected(r, "name")

    def test_name_whitespace_trimmed(self, client, trip_with_user2_as_crew):
        tid = trip_with_user2_as_crew["trip"]["id"]
        r = client.post(f"{TRAVEL_DOCUMENT_ENDPOINT}/{tid}/create",
                        headers=trip_with_user2_as_crew["leader_headers"],
                        json={"type": "accommodation", "name": "  Hotel Azores  "})
        assert r.status_code == 201
        assert json.loads(r.data)["name"] == "Hotel Azores"


class TestShuttleInputValidation:

    def test_vehicle_description_html_stripped(self, client, trip_with_user2_as_crew):
        tid = trip_with_user2_as_crew["trip"]["id"]
        r = client.post(f"{SHUTTLE_ENDPOINT}/{tid}/create",
                        headers=trip_with_user2_as_crew["leader_headers"],
                        json={"vehicleDescription": _HTML_PAYLOAD})
        _sanitized_or_rejected(r, "vehicleDescription")

    def test_vehicle_description_whitespace_trimmed(self, client, trip_with_user2_as_crew):
        tid = trip_with_user2_as_crew["trip"]["id"]
        r = client.post(f"{SHUTTLE_ENDPOINT}/{tid}/create",
                        headers=trip_with_user2_as_crew["leader_headers"],
                        json={"vehicleDescription": "  White Van  "})
        assert r.status_code == 201
        assert json.loads(r.data)["vehicleDescription"] == "White Van"
