"""
Float plan security tests — authorization boundaries and token attack surface (M3h).

Covers gaps not addressed by 22_m3h_float_plan_share_test.py:
- Unauthenticated (no JWT) access to all logistics/share endpoints → 401
- Crew cannot write leader-only shore contact fields → 403
- Token injection: SQL chars, oversized, URL-encoded traversal → 404, not 500
- HTTP method enforcement on the public read-only endpoint → 405
- Snapshot is frozen at generation time — downstream logistics edits do not leak through
- Known data exposure: crew emails and shore contact email ARE in the snapshot (intentional, documented)
- No internal database IDs (UUIDs) are present in the snapshot
"""
import json

import pytest

from Resources.logistics_resource import LOGISTICS_ENDPOINT
from Resources.float_plan_resource import FLOAT_PLAN_ENDPOINT
from Resources.trip_resource import TRIP_ENDPOINT


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _generate_share(client, trip_id, headers) -> str:
    r = client.post(f"{LOGISTICS_ENDPOINT}/{trip_id}/share", headers=headers)
    assert r.status_code == 200
    return json.loads(r.data)["shareToken"]


def _get_snapshot(client, token) -> dict:
    r = client.get(f"{FLOAT_PLAN_ENDPOINT}/public/{token}")
    assert r.status_code == 200
    return json.loads(r.data)


# ===========================================================================
# Unauthenticated access — all logistics endpoints must reject with 401
# ===========================================================================

class TestUnauthenticatedBlocked:

    def test_get_logistics_no_auth_returns_401(self, client, trip_with_user2_as_crew):
        trip_id = trip_with_user2_as_crew["trip"]["id"]
        r = client.get(f"{LOGISTICS_ENDPOINT}/{trip_id}")
        assert r.status_code == 401

    def test_put_logistics_no_auth_returns_401(self, client, trip_with_user2_as_crew):
        trip_id = trip_with_user2_as_crew["trip"]["id"]
        r = client.put(f"{LOGISTICS_ENDPOINT}/{trip_id}", json={"shoreContactName": "Alice"})
        assert r.status_code == 401

    def test_generate_share_no_auth_returns_401(self, client, trip_with_user2_as_crew):
        trip_id = trip_with_user2_as_crew["trip"]["id"]
        r = client.post(f"{LOGISTICS_ENDPOINT}/{trip_id}/share")
        assert r.status_code == 401

    def test_send_email_no_auth_returns_401(self, client, trip_with_user2_as_crew):
        trip_id = trip_with_user2_as_crew["trip"]["id"]
        r = client.post(f"{LOGISTICS_ENDPOINT}/{trip_id}/share/email")
        assert r.status_code == 401


# ===========================================================================
# Role-based field writes — crew cannot touch shore contact fields
# ===========================================================================

class TestCrewCannotWriteShoreContactFields:

    def test_crew_cannot_set_shore_contact_email(self, client, trip_with_user2_as_crew):
        trip_id = trip_with_user2_as_crew["trip"]["id"]
        r = client.put(
            f"{LOGISTICS_ENDPOINT}/{trip_id}",
            headers=trip_with_user2_as_crew["crew_headers"],
            json={"shoreContactEmail": "hacker@example.com"},
        )
        assert r.status_code == 403

    def test_crew_cannot_set_shore_contact_name(self, client, trip_with_user2_as_crew):
        trip_id = trip_with_user2_as_crew["trip"]["id"]
        r = client.put(
            f"{LOGISTICS_ENDPOINT}/{trip_id}",
            headers=trip_with_user2_as_crew["crew_headers"],
            json={"shoreContactName": "Injected Name"},
        )
        assert r.status_code == 403

    def test_crew_cannot_set_shore_contact_phone(self, client, trip_with_user2_as_crew):
        trip_id = trip_with_user2_as_crew["trip"]["id"]
        r = client.put(
            f"{LOGISTICS_ENDPOINT}/{trip_id}",
            headers=trip_with_user2_as_crew["crew_headers"],
            json={"shoreContactPhone": "+440000000000"},
        )
        assert r.status_code == 403

    def test_crew_cannot_set_shore_contact_relationship(self, client, trip_with_user2_as_crew):
        trip_id = trip_with_user2_as_crew["trip"]["id"]
        r = client.put(
            f"{LOGISTICS_ENDPOINT}/{trip_id}",
            headers=trip_with_user2_as_crew["crew_headers"],
            json={"shoreContactRelationship": "parent"},
        )
        assert r.status_code == 403


# ===========================================================================
# Token injection — bad inputs must return 404, never 500
# ===========================================================================

class TestTokenInputValidation:

    def test_sql_injection_token_returns_404_not_500(self, client):
        token = "'; DROP TABLE logistics; --"
        r = client.get(f"{FLOAT_PLAN_ENDPOINT}/public/{token}")
        assert r.status_code == 404

    def test_xss_payload_token_returns_404_not_500(self, client):
        token = "<script>alert(1)</script>"
        r = client.get(f"{FLOAT_PLAN_ENDPOINT}/public/{token}")
        assert r.status_code == 404

    def test_oversized_token_returns_404_not_500(self, client):
        token = "a" * 500
        r = client.get(f"{FLOAT_PLAN_ENDPOINT}/public/{token}")
        assert r.status_code == 404

    def test_url_encoded_path_traversal_returns_404_not_500(self, client):
        # Slashes must be percent-encoded to reach the route handler as part of <token>
        token = "..%2F..%2F..%2Fetc%2Fpasswd"
        r = client.get(f"{FLOAT_PLAN_ENDPOINT}/public/{token}")
        assert r.status_code == 404

    def test_null_byte_token_returns_404_not_500(self, client):
        token = "validprefix%00injected"
        r = client.get(f"{FLOAT_PLAN_ENDPOINT}/public/{token}")
        assert r.status_code == 404


# ===========================================================================
# HTTP method enforcement — public endpoint is GET-only
# ===========================================================================

class TestHttpMethodEnforcement:

    def test_post_on_public_endpoint_returns_405(self, client, trip_with_user2_as_crew):
        trip_id = trip_with_user2_as_crew["trip"]["id"]
        token = _generate_share(client, trip_id, trip_with_user2_as_crew["leader_headers"])
        r = client.post(f"{FLOAT_PLAN_ENDPOINT}/public/{token}")
        assert r.status_code == 405

    def test_delete_on_public_endpoint_returns_405(self, client, trip_with_user2_as_crew):
        trip_id = trip_with_user2_as_crew["trip"]["id"]
        token = _generate_share(client, trip_id, trip_with_user2_as_crew["leader_headers"])
        r = client.delete(f"{FLOAT_PLAN_ENDPOINT}/public/{token}")
        assert r.status_code == 405

    def test_patch_on_public_endpoint_returns_405(self, client, trip_with_user2_as_crew):
        trip_id = trip_with_user2_as_crew["trip"]["id"]
        token = _generate_share(client, trip_id, trip_with_user2_as_crew["leader_headers"])
        r = client.patch(f"{FLOAT_PLAN_ENDPOINT}/public/{token}")
        assert r.status_code == 405

    def test_get_on_share_generate_endpoint_returns_405(self, client, trip_with_user2_as_crew):
        trip_id = trip_with_user2_as_crew["trip"]["id"]
        r = client.get(
            f"{LOGISTICS_ENDPOINT}/{trip_id}/share",
            headers=trip_with_user2_as_crew["leader_headers"],
        )
        assert r.status_code == 405


# ===========================================================================
# Snapshot is frozen — edits after generation must not leak through
# ===========================================================================

class TestSnapshotIsFrozen:

    def test_shore_contact_change_does_not_update_existing_snapshot(self, client, trip_with_user2_as_crew):
        trip_id = trip_with_user2_as_crew["trip"]["id"]
        client.put(
            f"{LOGISTICS_ENDPOINT}/{trip_id}",
            headers=trip_with_user2_as_crew["leader_headers"],
            json={"shoreContactName": "Original Shore"},
        )
        token = _generate_share(client, trip_id, trip_with_user2_as_crew["leader_headers"])

        client.put(
            f"{LOGISTICS_ENDPOINT}/{trip_id}",
            headers=trip_with_user2_as_crew["leader_headers"],
            json={"shoreContactName": "Replacement Shore"},
        )

        snapshot = _get_snapshot(client, token)
        shore = snapshot.get("shoreContact") or {}
        assert shore.get("name") == "Original Shore"

    def test_trip_destination_change_does_not_update_existing_snapshot(self, client, trip_with_user2_as_crew):
        trip_id = trip_with_user2_as_crew["trip"]["id"]
        client.patch(
            f"{TRIP_ENDPOINT}/{trip_id}",
            headers=trip_with_user2_as_crew["leader_headers"],
            json={"destination": "Original Destination"},
        )
        token = _generate_share(client, trip_id, trip_with_user2_as_crew["leader_headers"])

        client.patch(
            f"{TRIP_ENDPOINT}/{trip_id}",
            headers=trip_with_user2_as_crew["leader_headers"],
            json={"destination": "Changed Destination"},
        )

        snapshot = _get_snapshot(client, token)
        assert snapshot["trip"]["destination"] == "Original Destination"


# ===========================================================================
# Snapshot data exposure audit — document what is and is not present
# ===========================================================================

class TestSnapshotExposureAudit:

    def test_crew_email_is_present_in_snapshot(self, client, trip_with_user2_as_crew):
        """Crew email is intentionally included — shore contacts need to know who is paddling."""
        trip_id = trip_with_user2_as_crew["trip"]["id"]
        token = _generate_share(client, trip_id, trip_with_user2_as_crew["leader_headers"])
        snapshot = _get_snapshot(client, token)
        emails_in_snapshot = [m["mail"] for m in snapshot["crew"]]
        assert trip_with_user2_as_crew["crew_email"] in emails_in_snapshot

    def test_shore_contact_email_is_present_in_snapshot(self, client, trip_with_user2_as_crew):
        """Shore contact email is intentionally included in the snapshot."""
        trip_id = trip_with_user2_as_crew["trip"]["id"]
        client.put(
            f"{LOGISTICS_ENDPOINT}/{trip_id}",
            headers=trip_with_user2_as_crew["leader_headers"],
            json={"shoreContactEmail": "shore@example.com"},
        )
        token = _generate_share(client, trip_id, trip_with_user2_as_crew["leader_headers"])
        snapshot = _get_snapshot(client, token)
        assert snapshot["shoreContact"]["email"] == "shore@example.com"

    def test_snapshot_contains_no_internal_uuids(self, client, trip_with_user2_as_crew):
        """Internal trip/user/member UUIDs must not appear in the public snapshot."""
        trip_id = trip_with_user2_as_crew["trip"]["id"]
        token = _generate_share(client, trip_id, trip_with_user2_as_crew["leader_headers"])
        snapshot = _get_snapshot(client, token)

        snapshot_str = json.dumps(snapshot)
        assert trip_id not in snapshot_str
        for member in snapshot["crew"]:
            assert "id" not in member

    def test_snapshot_contains_no_medical_notes(self, client, trip_with_user2_as_crew):
        """Medical notes must be absent from the snapshot — covered here as a regression anchor."""
        trip_id = trip_with_user2_as_crew["trip"]["id"]
        token = _generate_share(client, trip_id, trip_with_user2_as_crew["leader_headers"])
        snapshot = _get_snapshot(client, token)
        snapshot_str = json.dumps(snapshot)
        assert "medicalNotes" not in snapshot_str
        assert "medicalNotesCiphertext" not in snapshot_str
