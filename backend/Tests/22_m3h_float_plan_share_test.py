"""
M3h integration tests — float plan public sharing and shore contact email.

Covers:
  POST /api/logistics/<trip_id>/share      — generate/regenerate share token
  GET  /api/float-plan/public/<token>      — unauthenticated public endpoint
  POST /api/logistics/<trip_id>/share/email — send shore contact email
"""
import json
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import pytest

from Resources.logistics_resource import LOGISTICS_ENDPOINT
from Resources.float_plan_resource import FLOAT_PLAN_ENDPOINT
from Resources.trip_resource import TRIP_ENDPOINT


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _create_trip(client, headers) -> dict:
    r = client.post(f"{TRIP_ENDPOINT}/create", json={}, headers=headers)
    assert r.status_code == 201
    return json.loads(r.data)


def _set_shore_contact(client, trip_id, headers, email="shore@example.com"):
    r = client.put(
        f"{LOGISTICS_ENDPOINT}/{trip_id}",
        headers=headers,
        json={"shoreContactName": "Alice Shore", "shoreContactEmail": email},
    )
    assert r.status_code == 200


def _generate_share(client, trip_id, headers) -> dict:
    r = client.post(f"{LOGISTICS_ENDPOINT}/{trip_id}/share", headers=headers)
    assert r.status_code == 200
    return json.loads(r.data)


# ===========================================================================
# POST /api/logistics/<trip_id>/share
# ===========================================================================

class TestFloatPlanShareGenerate:

    def test_leader_can_generate_share_link(self, client, trip_with_user2_as_crew):
        trip_id = trip_with_user2_as_crew["trip"]["id"]
        data = _generate_share(client, trip_id, trip_with_user2_as_crew["leader_headers"])
        assert data["shareToken"] is not None
        assert len(data["shareToken"]) > 20
        assert data["snapshotGeneratedAt"] is not None

    def test_share_token_appears_in_logistics_get(self, client, trip_with_user2_as_crew):
        trip_id = trip_with_user2_as_crew["trip"]["id"]
        _generate_share(client, trip_id, trip_with_user2_as_crew["leader_headers"])
        r = client.get(f"{LOGISTICS_ENDPOINT}/{trip_id}", headers=trip_with_user2_as_crew["leader_headers"])
        assert r.status_code == 200
        data = json.loads(r.data)
        assert data["shareToken"] is not None

    def test_regeneration_returns_new_token(self, client, trip_with_user2_as_crew):
        trip_id = trip_with_user2_as_crew["trip"]["id"]
        first = _generate_share(client, trip_id, trip_with_user2_as_crew["leader_headers"])
        second = _generate_share(client, trip_id, trip_with_user2_as_crew["leader_headers"])
        assert first["shareToken"] != second["shareToken"]

    def test_crew_cannot_generate_share_link(self, client, trip_with_user2_as_crew):
        trip_id = trip_with_user2_as_crew["trip"]["id"]
        r = client.post(
            f"{LOGISTICS_ENDPOINT}/{trip_id}/share",
            headers=trip_with_user2_as_crew["crew_headers"],
        )
        assert r.status_code == 403

    def test_non_member_cannot_generate_share_link(self, client, outsider_headers, trip_with_user2_as_crew):
        trip_id = trip_with_user2_as_crew["trip"]["id"]
        r = client.post(f"{LOGISTICS_ENDPOINT}/{trip_id}/share", headers=outsider_headers)
        assert r.status_code == 403

    def test_snapshot_excludes_medical_notes(self, client, trip_with_user2_as_crew):
        trip_id = trip_with_user2_as_crew["trip"]["id"]
        _generate_share(client, trip_id, trip_with_user2_as_crew["leader_headers"])
        token = json.loads(
            client.get(f"{LOGISTICS_ENDPOINT}/{trip_id}", headers=trip_with_user2_as_crew["leader_headers"]).data
        )["shareToken"]
        snapshot = json.loads(
            client.get(f"{FLOAT_PLAN_ENDPOINT}/public/{token}").data
        )
        for member in snapshot.get("crew", []):
            assert "medicalNotes" not in member
            assert "medicalNotesCiphertext" not in member

    def test_snapshot_contains_crew_vessel_and_emergency_contact(self, client, trip_with_user2_as_crew):
        trip_id = trip_with_user2_as_crew["trip"]["id"]
        _generate_share(client, trip_id, trip_with_user2_as_crew["leader_headers"])
        token = json.loads(
            client.get(f"{LOGISTICS_ENDPOINT}/{trip_id}", headers=trip_with_user2_as_crew["leader_headers"]).data
        )["shareToken"]
        snapshot = json.loads(client.get(f"{FLOAT_PLAN_ENDPOINT}/public/{token}").data)
        assert len(snapshot["crew"]) >= 1
        for member in snapshot["crew"]:
            assert "vessel" in member
            assert "emergencyContact" in member
            assert "role" in member
            assert "name" in member


# ===========================================================================
# GET /api/float-plan/public/<token>
# ===========================================================================

class TestFloatPlanPublicEndpoint:

    def test_valid_token_returns_snapshot(self, client, trip_with_user2_as_crew):
        trip_id = trip_with_user2_as_crew["trip"]["id"]
        _generate_share(client, trip_id, trip_with_user2_as_crew["leader_headers"])
        token = json.loads(
            client.get(f"{LOGISTICS_ENDPOINT}/{trip_id}", headers=trip_with_user2_as_crew["leader_headers"]).data
        )["shareToken"]
        r = client.get(f"{FLOAT_PLAN_ENDPOINT}/public/{token}")
        assert r.status_code == 200
        data = json.loads(r.data)
        assert "crew" in data
        assert "trip" in data
        assert "generatedAt" in data

    def test_no_auth_required(self, client, trip_with_user2_as_crew):
        trip_id = trip_with_user2_as_crew["trip"]["id"]
        _generate_share(client, trip_id, trip_with_user2_as_crew["leader_headers"])
        token = json.loads(
            client.get(f"{LOGISTICS_ENDPOINT}/{trip_id}", headers=trip_with_user2_as_crew["leader_headers"]).data
        )["shareToken"]
        # No auth headers — must still succeed
        r = client.get(f"{FLOAT_PLAN_ENDPOINT}/public/{token}")
        assert r.status_code == 200

    def test_unknown_token_returns_404(self, client):
        r = client.get(f"{FLOAT_PLAN_ENDPOINT}/public/totallyunknowntoken1234567890")
        assert r.status_code == 404

    def test_expired_token_returns_404(self, client, app, trip_with_user2_as_crew):
        from Models.logistics import Logistics
        from Api.database import db

        trip_id = trip_with_user2_as_crew["trip"]["id"]
        _generate_share(client, trip_id, trip_with_user2_as_crew["leader_headers"])
        token = json.loads(
            client.get(f"{LOGISTICS_ENDPOINT}/{trip_id}", headers=trip_with_user2_as_crew["leader_headers"]).data
        )["shareToken"]

        with app.app_context():
            logistics = db.session.query(Logistics).filter_by(share_token=token).first()
            logistics.share_token_expires_at = datetime.now(timezone.utc) - timedelta(days=1)
            db.session.commit()

        r = client.get(f"{FLOAT_PLAN_ENDPOINT}/public/{token}")
        assert r.status_code == 404

    def test_old_token_invalid_after_regeneration(self, client, trip_with_user2_as_crew):
        trip_id = trip_with_user2_as_crew["trip"]["id"]
        first = _generate_share(client, trip_id, trip_with_user2_as_crew["leader_headers"])
        old_token = first["shareToken"]
        _generate_share(client, trip_id, trip_with_user2_as_crew["leader_headers"])
        r = client.get(f"{FLOAT_PLAN_ENDPOINT}/public/{old_token}")
        assert r.status_code == 404


# ===========================================================================
# POST /api/logistics/<trip_id>/share/email
# ===========================================================================

class TestFloatPlanShareEmail:

    def test_leader_can_send_email_when_token_and_email_set(self, client, trip_with_user2_as_crew):
        trip_id = trip_with_user2_as_crew["trip"]["id"]
        _set_shore_contact(client, trip_id, trip_with_user2_as_crew["leader_headers"])
        _generate_share(client, trip_id, trip_with_user2_as_crew["leader_headers"])
        with patch("Services.logistics_service.send_template_email") as mock_send:
            r = client.post(
                f"{LOGISTICS_ENDPOINT}/{trip_id}/share/email",
                headers=trip_with_user2_as_crew["leader_headers"],
            )
        assert r.status_code == 204
        mock_send.assert_called_once()
        _, kwargs = mock_send.call_args
        assert kwargs.get("template") == "float_plan_share" or mock_send.call_args[0][2] == "float_plan_share"

    def test_email_fails_with_400_when_no_token(self, client, trip_with_user2_as_crew):
        trip_id = trip_with_user2_as_crew["trip"]["id"]
        _set_shore_contact(client, trip_id, trip_with_user2_as_crew["leader_headers"])
        r = client.post(
            f"{LOGISTICS_ENDPOINT}/{trip_id}/share/email",
            headers=trip_with_user2_as_crew["leader_headers"],
        )
        assert r.status_code == 400

    def test_email_fails_with_400_when_no_shore_contact_email(self, client, trip_with_user2_as_crew):
        trip_id = trip_with_user2_as_crew["trip"]["id"]
        _generate_share(client, trip_id, trip_with_user2_as_crew["leader_headers"])
        r = client.post(
            f"{LOGISTICS_ENDPOINT}/{trip_id}/share/email",
            headers=trip_with_user2_as_crew["leader_headers"],
        )
        assert r.status_code == 400

    def test_crew_cannot_send_email(self, client, trip_with_user2_as_crew):
        trip_id = trip_with_user2_as_crew["trip"]["id"]
        _set_shore_contact(client, trip_id, trip_with_user2_as_crew["leader_headers"])
        _generate_share(client, trip_id, trip_with_user2_as_crew["leader_headers"])
        r = client.post(
            f"{LOGISTICS_ENDPOINT}/{trip_id}/share/email",
            headers=trip_with_user2_as_crew["crew_headers"],
        )
        assert r.status_code == 403

    def test_non_member_cannot_send_email(self, client, outsider_headers, trip_with_user2_as_crew):
        trip_id = trip_with_user2_as_crew["trip"]["id"]
        r = client.post(
            f"{LOGISTICS_ENDPOINT}/{trip_id}/share/email",
            headers=outsider_headers,
        )
        assert r.status_code == 403
