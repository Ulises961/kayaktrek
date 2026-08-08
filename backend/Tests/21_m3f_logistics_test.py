"""
M3f integration tests — Logistics, TravelDocument, ShuttleVehicle, ShuttlePassenger.

Storage calls (upload, delete, presigned_url) are patched so tests run without MinIO.
"""
import io
import json
from datetime import date, timedelta
from unittest.mock import patch, MagicMock

import pytest

from Resources.logistics_resource import LOGISTICS_ENDPOINT
from Resources.travel_document_resource import TRAVEL_DOCUMENT_ENDPOINT
from Resources.shuttle_resource import SHUTTLE_ENDPOINT
from Resources.trip_resource import TRIP_ENDPOINT
from Models.trip import TripStateType

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

# Document dates are relative to the run date, never hardcoded: the editable
# window is evaluated against date.today(), so a literal turns these tests into
# a time bomb that silently changes what they cover on the day it passes.
FUTURE_DATE = (date.today() + timedelta(days=60)).isoformat()
PAST_DATE = (date.today() - timedelta(days=60)).isoformat()

def _member_id(client, trip_id: str, headers: dict) -> str:
    """Return the TripMember.id for the calling user on the given trip."""
    r = client.get(f"{TRIP_ENDPOINT}/{trip_id}/member/me", headers=headers)
    assert r.status_code == 200, r.data
    return json.loads(r.data)["id"]


def _create_doc(client, trip_id: str, headers: dict, **kwargs) -> dict:
    payload = {
        "type": "accommodation",
        "name": "Hotel Marisol",
        **kwargs,
    }
    r = client.post(f"{TRAVEL_DOCUMENT_ENDPOINT}/{trip_id}/create", headers=headers, json=payload)
    assert r.status_code == 201, r.data
    return json.loads(r.data)


def _create_vehicle(client, trip_id: str, headers: dict, **kwargs) -> dict:
    payload = {"vehicleDescription": "Blue Subaru", **kwargs}
    r = client.post(f"{SHUTTLE_ENDPOINT}/{trip_id}/create", headers=headers, json=payload)
    assert r.status_code == 201, r.data
    return json.loads(r.data)


def _list_docs(client, trip_id: str, headers: dict) -> dict:
    r = client.get(f"{TRAVEL_DOCUMENT_ENDPOINT}/{trip_id}/all", headers=headers)
    assert r.status_code == 200, r.data
    return {d["id"]: d for d in json.loads(r.data)}


def _list_vehicles(client, trip_id: str, headers: dict) -> dict:
    r = client.get(f"{SHUTTLE_ENDPOINT}/{trip_id}/all", headers=headers)
    assert r.status_code == 200, r.data
    return {v["id"]: v for v in json.loads(r.data)}


# ===========================================================================
# Logistics — GET / PUT
# ===========================================================================

class TestLogisticsGet:

    def test_get_returns_empty_when_not_created(self, client, trip_with_user2_as_crew):
        trip_id = trip_with_user2_as_crew["trip"]["id"]
        r = client.get(f"{LOGISTICS_ENDPOINT}/{trip_id}", headers=trip_with_user2_as_crew["leader_headers"])
        assert r.status_code == 200
        assert json.loads(r.data) == {}

    def test_crew_can_get_logistics(self, client, trip_with_user2_as_crew):
        trip_id = trip_with_user2_as_crew["trip"]["id"]
        r = client.get(f"{LOGISTICS_ENDPOINT}/{trip_id}", headers=trip_with_user2_as_crew["crew_headers"])
        assert r.status_code == 200

    def test_non_member_gets_403(self, client, outsider_headers, trip_with_user2_as_crew):
        trip_id = trip_with_user2_as_crew["trip"]["id"]
        r = client.get(f"{LOGISTICS_ENDPOINT}/{trip_id}", headers=outsider_headers)
        assert r.status_code == 403


class TestLogisticsUpsert:

    def test_leader_can_create_logistics(self, client, trip_with_user2_as_crew):
        trip_id = trip_with_user2_as_crew["trip"]["id"]
        payload = {
            "shoreContactName": "Alice",
            "shoreContactPhone": "+441234567890",
        }
        r = client.put(f"{LOGISTICS_ENDPOINT}/{trip_id}", headers=trip_with_user2_as_crew["leader_headers"], json=payload)
        assert r.status_code == 200
        data = json.loads(r.data)
        assert data["shoreContactName"] == "Alice"
        assert "id" in data

    def test_put_is_idempotent(self, client, trip_with_user2_as_crew):
        trip_id = trip_with_user2_as_crew["trip"]["id"]
        first = client.put(f"{LOGISTICS_ENDPOINT}/{trip_id}", headers=trip_with_user2_as_crew["leader_headers"],
                           json={"shoreContactName": "Alice"})
        second = client.put(f"{LOGISTICS_ENDPOINT}/{trip_id}", headers=trip_with_user2_as_crew["leader_headers"],
                            json={"shoreContactName": "Bob"})
        assert first.status_code == 200
        assert second.status_code == 200
        assert json.loads(first.data)["id"] == json.loads(second.data)["id"]
        assert json.loads(second.data)["shoreContactName"] == "Bob"

    def test_crew_can_update_shuttle_notes(self, client, trip_with_user2_as_crew):
        trip_id = trip_with_user2_as_crew["trip"]["id"]
        # ensure logistics exists first
        client.put(f"{LOGISTICS_ENDPOINT}/{trip_id}", headers=trip_with_user2_as_crew["leader_headers"], json={})
        r = client.put(
            f"{LOGISTICS_ENDPOINT}/{trip_id}",
            headers=trip_with_user2_as_crew["crew_headers"],
            json={"shuttleNotes": "Meet at the pub car park"},
        )
        assert r.status_code == 200
        assert json.loads(r.data)["shuttleNotes"] == "Meet at the pub car park"

    def test_non_member_gets_403(self, client, outsider_headers, trip_with_user2_as_crew):
        trip_id = trip_with_user2_as_crew["trip"]["id"]
        r = client.put(f"{LOGISTICS_ENDPOINT}/{trip_id}", headers=outsider_headers, json={})
        assert r.status_code == 403


# ===========================================================================
# TravelDocument — CRUD
# ===========================================================================

class TestTravelDocumentList:

    def test_empty_list(self, client, trip_with_user2_as_crew):
        trip_id = trip_with_user2_as_crew["trip"]["id"]
        r = client.get(f"{TRAVEL_DOCUMENT_ENDPOINT}/{trip_id}/all",
                       headers=trip_with_user2_as_crew["leader_headers"])
        assert r.status_code == 200
        assert json.loads(r.data) == []

    def test_non_member_gets_403(self, client, outsider_headers, trip_with_user2_as_crew):
        trip_id = trip_with_user2_as_crew["trip"]["id"]
        r = client.get(f"{TRAVEL_DOCUMENT_ENDPOINT}/{trip_id}/all", headers=outsider_headers)
        assert r.status_code == 403


class TestTravelDocumentCreate:

    def test_leader_creates_document(self, client, trip_with_user2_as_crew):
        trip_id = trip_with_user2_as_crew["trip"]["id"]
        doc = _create_doc(client, trip_id, trip_with_user2_as_crew["leader_headers"],
                          date="2026-08-15", confirmationNumber="ABC123")
        assert doc["name"] == "Hotel Marisol"
        assert doc["type"] == "accommodation"
        assert doc["date"] == "2026-08-15"
        assert doc["confirmationNumber"] == "ABC123"
        assert "id" in doc

    def test_crew_can_create_document(self, client, trip_with_user2_as_crew):
        trip_id = trip_with_user2_as_crew["trip"]["id"]
        doc = _create_doc(client, trip_id, trip_with_user2_as_crew["crew_headers"])
        assert doc["type"] == "accommodation"

    def test_document_appears_in_list(self, client, trip_with_user2_as_crew):
        trip_id = trip_with_user2_as_crew["trip"]["id"]
        _create_doc(client, trip_id, trip_with_user2_as_crew["leader_headers"])
        r = client.get(f"{TRAVEL_DOCUMENT_ENDPOINT}/{trip_id}/all",
                       headers=trip_with_user2_as_crew["leader_headers"])
        docs = json.loads(r.data)
        assert len(docs) >= 1

    def test_non_member_gets_403(self, client, outsider_headers, trip_with_user2_as_crew):
        trip_id = trip_with_user2_as_crew["trip"]["id"]
        r = client.post(f"{TRAVEL_DOCUMENT_ENDPOINT}/{trip_id}/create", headers=outsider_headers,
                        json={"type": "accommodation", "name": "Hack"})
        assert r.status_code == 403

    def test_missing_required_fields_returns_422(self, client, trip_with_user2_as_crew):
        trip_id = trip_with_user2_as_crew["trip"]["id"]
        r = client.post(f"{TRAVEL_DOCUMENT_ENDPOINT}/{trip_id}/create",
                        headers=trip_with_user2_as_crew["leader_headers"],
                        json={"name": "No type"})
        assert r.status_code == 422

    def test_expiry_before_date_returns_422(self, client, trip_with_user2_as_crew):
        trip_id = trip_with_user2_as_crew["trip"]["id"]
        r = client.post(
            f"{TRAVEL_DOCUMENT_ENDPOINT}/{trip_id}/create",
            headers=trip_with_user2_as_crew["leader_headers"],
            json={"type": "insurance", "name": "Policy", "date": "2026-08-15", "expiryDate": "2026-07-01"},
        )
        assert r.status_code == 422


class TestTravelDocumentUpdate:

    def test_owner_can_update(self, client, trip_with_user2_as_crew):
        trip_id = trip_with_user2_as_crew["trip"]["id"]
        doc = _create_doc(client, trip_id, trip_with_user2_as_crew["crew_headers"],
                          date="2026-09-01")
        r = client.patch(f"{TRAVEL_DOCUMENT_ENDPOINT}/{doc['id']}",
                         headers=trip_with_user2_as_crew["crew_headers"],
                         json={"name": "Hotel Nordkapp"})
        assert r.status_code == 200
        assert json.loads(r.data)["name"] == "Hotel Nordkapp"

    def test_leader_can_update_any_document(self, client, trip_with_user2_as_crew):
        trip_id = trip_with_user2_as_crew["trip"]["id"]
        doc = _create_doc(client, trip_id, trip_with_user2_as_crew["crew_headers"],
                          date="2026-09-01")
        r = client.patch(f"{TRAVEL_DOCUMENT_ENDPOINT}/{doc['id']}",
                         headers=trip_with_user2_as_crew["leader_headers"],
                         json={"notes": "Leader override"})
        assert r.status_code == 200
        assert json.loads(r.data)["notes"] == "Leader override"

    def test_non_owner_crew_cannot_update(self, client, trip_with_user2_as_crew, outsider_headers):
        trip_id = trip_with_user2_as_crew["trip"]["id"]
        # Leader creates a doc; crew (user_2) should not be able to update it
        doc = _create_doc(client, trip_id, trip_with_user2_as_crew["leader_headers"],
                          date="2026-09-01")
        r = client.patch(f"{TRAVEL_DOCUMENT_ENDPOINT}/{doc['id']}",
                         headers=trip_with_user2_as_crew["crew_headers"],
                         json={"name": "Hacked"})
        assert r.status_code == 403

        # The rejected update must be a true no-op.
        docs = _list_docs(client, trip_id, trip_with_user2_as_crew["leader_headers"])
        assert docs[doc["id"]]["name"] == "Hotel Marisol"

    def test_expiry_before_date_returns_422(self, client, trip_with_user2_as_crew):
        trip_id = trip_with_user2_as_crew["trip"]["id"]
        doc = _create_doc(client, trip_id, trip_with_user2_as_crew["leader_headers"],
                          date="2026-09-01")
        r = client.patch(
            f"{TRAVEL_DOCUMENT_ENDPOINT}/{doc['id']}",
            headers=trip_with_user2_as_crew["leader_headers"],
            json={"expiryDate": "2026-08-01"},
        )
        assert r.status_code == 422


class TestTravelDocumentDelete:

    def test_owner_can_delete(self, client, trip_with_user2_as_crew):
        trip_id = trip_with_user2_as_crew["trip"]["id"]
        doc = _create_doc(client, trip_id, trip_with_user2_as_crew["crew_headers"],
                          date=FUTURE_DATE)
        r = client.delete(f"{TRAVEL_DOCUMENT_ENDPOINT}/{doc['id']}",
                          headers=trip_with_user2_as_crew["crew_headers"])
        assert r.status_code == 204
        assert doc["id"] not in _list_docs(client, trip_id, trip_with_user2_as_crew["leader_headers"])

    def test_leader_can_delete_any_document(self, client, trip_with_user2_as_crew):
        trip_id = trip_with_user2_as_crew["trip"]["id"]
        doc = _create_doc(client, trip_id, trip_with_user2_as_crew["crew_headers"],
                          date=FUTURE_DATE)
        r = client.delete(f"{TRAVEL_DOCUMENT_ENDPOINT}/{doc['id']}",
                          headers=trip_with_user2_as_crew["leader_headers"])
        assert r.status_code == 204
        assert doc["id"] not in _list_docs(client, trip_id, trip_with_user2_as_crew["leader_headers"])

    def test_non_owner_crew_cannot_delete(self, client, trip_with_user2_as_crew):
        trip_id = trip_with_user2_as_crew["trip"]["id"]
        doc = _create_doc(client, trip_id, trip_with_user2_as_crew["leader_headers"],
                          date=FUTURE_DATE)
        r = client.delete(f"{TRAVEL_DOCUMENT_ENDPOINT}/{doc['id']}",
                          headers=trip_with_user2_as_crew["crew_headers"])
        assert r.status_code == 403

        # The rejected delete must be a true no-op — the document still exists.
        assert doc["id"] in _list_docs(client, trip_id, trip_with_user2_as_crew["leader_headers"])

    def test_non_member_gets_403(self, client, outsider_headers, trip_with_user2_as_crew):
        trip_id = trip_with_user2_as_crew["trip"]["id"]
        doc = _create_doc(client, trip_id, trip_with_user2_as_crew["leader_headers"],
                          date=FUTURE_DATE)
        r = client.delete(f"{TRAVEL_DOCUMENT_ENDPOINT}/{doc['id']}", headers=outsider_headers)
        assert r.status_code == 403
        assert doc["id"] in _list_docs(client, trip_id, trip_with_user2_as_crew["leader_headers"])

    def test_owner_can_delete_document_whose_date_has_passed(self, client, trip_with_user2_as_crew):
        """An expired document is the one you most want gone — a mistyped year, a
        booking that fell through, the wrong scan. Freezing edits on it is
        defensible; refusing to remove it leaves it on the trip forever."""
        trip_id = trip_with_user2_as_crew["trip"]["id"]
        doc = _create_doc(client, trip_id, trip_with_user2_as_crew["crew_headers"],
                          date=PAST_DATE)
        r = client.delete(f"{TRAVEL_DOCUMENT_ENDPOINT}/{doc['id']}",
                          headers=trip_with_user2_as_crew["crew_headers"])
        assert r.status_code == 204

        listed = client.get(f"{TRAVEL_DOCUMENT_ENDPOINT}/{trip_id}/all",
                            headers=trip_with_user2_as_crew["crew_headers"])
        assert doc["id"] not in [d["id"] for d in json.loads(listed.data)]

    def test_owner_can_delete_document_whose_expiry_has_passed(self, client, trip_with_user2_as_crew):
        trip_id = trip_with_user2_as_crew["trip"]["id"]
        doc = _create_doc(client, trip_id, trip_with_user2_as_crew["crew_headers"],
                          type="insurance", expiryDate=PAST_DATE)
        r = client.delete(f"{TRAVEL_DOCUMENT_ENDPOINT}/{doc['id']}",
                          headers=trip_with_user2_as_crew["crew_headers"])
        assert r.status_code == 204

    def test_cannot_delete_on_a_completed_trip(self, client, trip_with_user2_as_crew):
        """The trip-level freeze is the boundary that survives: once a trip is
        past, its paperwork is the record of what happened."""
        trip_id = trip_with_user2_as_crew["trip"]["id"]
        leader_headers = trip_with_user2_as_crew["leader_headers"]
        doc = _create_doc(client, trip_id, leader_headers)

        for state in (TripStateType.HAPPENING.value, TripStateType.PAST.value):
            assert client.post(f"{TRIP_ENDPOINT}/{trip_id}/state", json={"state": state},
                               headers=leader_headers).status_code == 200

        r = client.delete(f"{TRAVEL_DOCUMENT_ENDPOINT}/{doc['id']}", headers=leader_headers)
        assert r.status_code == 403


class TestTravelDocumentEditableWindow:
    """The window is evaluated against the date the document actually stops
    being current, which for anything carrying both dates is the expiry."""

    def test_old_issue_date_with_future_expiry_stays_editable(self, client, trip_with_user2_as_crew):
        trip_id = trip_with_user2_as_crew["trip"]["id"]
        headers = trip_with_user2_as_crew["leader_headers"]
        # A passport issued years ago and valid for years yet.
        doc = _create_doc(client, trip_id, headers, type="permit",
                          date=PAST_DATE, expiryDate=FUTURE_DATE)
        r = client.patch(f"{TRAVEL_DOCUMENT_ENDPOINT}/{doc['id']}", headers=headers,
                         json={"name": "Renewed passport"})
        assert r.status_code == 200
        assert json.loads(r.data)["name"] == "Renewed passport"

    def test_expired_document_cannot_be_edited(self, client, trip_with_user2_as_crew):
        trip_id = trip_with_user2_as_crew["trip"]["id"]
        headers = trip_with_user2_as_crew["leader_headers"]
        doc = _create_doc(client, trip_id, headers, type="insurance", expiryDate=PAST_DATE)
        r = client.patch(f"{TRAVEL_DOCUMENT_ENDPOINT}/{doc['id']}", headers=headers,
                         json={"name": "Backdated"})
        assert r.status_code == 403

    def test_undated_document_cannot_be_edited_on_a_completed_trip(self, client, trip_with_user2_as_crew):
        trip_id = trip_with_user2_as_crew["trip"]["id"]
        headers = trip_with_user2_as_crew["leader_headers"]
        doc = _create_doc(client, trip_id, headers)

        for state in (TripStateType.HAPPENING.value, TripStateType.PAST.value):
            assert client.post(f"{TRIP_ENDPOINT}/{trip_id}/state", json={"state": state},
                               headers=headers).status_code == 200

        r = client.patch(f"{TRAVEL_DOCUMENT_ENDPOINT}/{doc['id']}", headers=headers,
                         json={"name": "Backdated"})
        assert r.status_code == 403

    def test_dated_document_cannot_be_edited_on_a_completed_trip(self, client, trip_with_user2_as_crew):
        """Carrying a date must not exempt a document from the trip-level freeze."""
        trip_id = trip_with_user2_as_crew["trip"]["id"]
        headers = trip_with_user2_as_crew["leader_headers"]
        doc = _create_doc(client, trip_id, headers, date=FUTURE_DATE)

        for state in (TripStateType.HAPPENING.value, TripStateType.PAST.value):
            assert client.post(f"{TRIP_ENDPOINT}/{trip_id}/state", json={"state": state},
                               headers=headers).status_code == 200

        r = client.patch(f"{TRAVEL_DOCUMENT_ENDPOINT}/{doc['id']}", headers=headers,
                         json={"name": "Backdated"})
        assert r.status_code == 403


# ===========================================================================
# TravelDocument — Attachment endpoints (StorageService mocked)
# ===========================================================================

_FAKE_PDF = b"%PDF-1.4 fake content that passes size check " + b"x" * 600


class TestTravelDocumentAttachment:

    @patch("Services.travel_document_service.StorageService.upload")
    @patch("Services.travel_document_service.StorageService.delete")
    def test_upload_attachment(self, mock_delete, mock_upload, client, trip_with_user2_as_crew):
        trip_id = trip_with_user2_as_crew["trip"]["id"]
        doc = _create_doc(client, trip_id, trip_with_user2_as_crew["leader_headers"])

        with patch("magic.from_buffer", return_value="application/pdf"):
            r = client.post(
                f"{TRAVEL_DOCUMENT_ENDPOINT}/{doc['id']}/attachment",
                headers=trip_with_user2_as_crew["leader_headers"],
                data={"file": (io.BytesIO(_FAKE_PDF), "booking.pdf")},
                content_type="multipart/form-data",
            )
        assert r.status_code == 200
        data = json.loads(r.data)
        assert data["attachmentPath"] is not None
        mock_upload.assert_called_once()

    @patch("Services.travel_document_service.StorageService.upload")
    @patch("Services.travel_document_service.StorageService.delete")
    def test_delete_attachment(self, mock_delete, mock_upload, client, trip_with_user2_as_crew):
        trip_id = trip_with_user2_as_crew["trip"]["id"]
        doc = _create_doc(client, trip_id, trip_with_user2_as_crew["leader_headers"])

        with patch("magic.from_buffer", return_value="application/pdf"):
            client.post(
                f"{TRAVEL_DOCUMENT_ENDPOINT}/{doc['id']}/attachment",
                headers=trip_with_user2_as_crew["leader_headers"],
                data={"file": (io.BytesIO(_FAKE_PDF), "booking.pdf")},
                content_type="multipart/form-data",
            )

        r = client.delete(
            f"{TRAVEL_DOCUMENT_ENDPOINT}/{doc['id']}/attachment",
            headers=trip_with_user2_as_crew["leader_headers"],
        )
        assert r.status_code == 200
        assert json.loads(r.data)["attachmentPath"] is None
        mock_delete.assert_called()

    @patch("Services.travel_document_service.StorageService.upload")
    @patch("Services.travel_document_service.StorageService.delete")
    def test_can_remove_attachment_once_the_document_date_has_passed(
        self, mock_delete, mock_upload, client, trip_with_user2_as_crew
    ):
        """The wrong scan on an out-of-date document is still the wrong scan —
        and it is the copy of a real permit or policy sitting in object storage,
        which is exactly the thing a member should be able to take back."""
        trip_id = trip_with_user2_as_crew["trip"]["id"]
        headers = trip_with_user2_as_crew["leader_headers"]
        doc = _create_doc(client, trip_id, headers, date=FUTURE_DATE)

        with patch("magic.from_buffer", return_value="application/pdf"):
            client.post(
                f"{TRAVEL_DOCUMENT_ENDPOINT}/{doc['id']}/attachment",
                headers=headers,
                data={"file": (io.BytesIO(_FAKE_PDF), "booking.pdf")},
                content_type="multipart/form-data",
            )

        # The date is corrected to the one it actually held, in the past.
        assert client.patch(f"{TRAVEL_DOCUMENT_ENDPOINT}/{doc['id']}", headers=headers,
                            json={"date": PAST_DATE}).status_code == 200

        r = client.delete(f"{TRAVEL_DOCUMENT_ENDPOINT}/{doc['id']}/attachment", headers=headers)
        assert r.status_code == 200
        assert json.loads(r.data)["attachmentPath"] is None
        mock_delete.assert_called()

    @patch("Services.travel_document_service.StorageService.upload")
    @patch("Services.travel_document_service.StorageService.delete")
    def test_cannot_remove_attachment_on_a_completed_trip(
        self, mock_delete, mock_upload, client, trip_with_user2_as_crew
    ):
        trip_id = trip_with_user2_as_crew["trip"]["id"]
        headers = trip_with_user2_as_crew["leader_headers"]
        doc = _create_doc(client, trip_id, headers)

        with patch("magic.from_buffer", return_value="application/pdf"):
            client.post(
                f"{TRAVEL_DOCUMENT_ENDPOINT}/{doc['id']}/attachment",
                headers=headers,
                data={"file": (io.BytesIO(_FAKE_PDF), "booking.pdf")},
                content_type="multipart/form-data",
            )

        for state in (TripStateType.HAPPENING.value, TripStateType.PAST.value):
            assert client.post(f"{TRIP_ENDPOINT}/{trip_id}/state", json={"state": state},
                               headers=headers).status_code == 200

        r = client.delete(f"{TRAVEL_DOCUMENT_ENDPOINT}/{doc['id']}/attachment", headers=headers)
        assert r.status_code == 403

    def test_delete_attachment_when_none_returns_404(self, client, trip_with_user2_as_crew):
        trip_id = trip_with_user2_as_crew["trip"]["id"]
        doc = _create_doc(client, trip_id, trip_with_user2_as_crew["leader_headers"])
        r = client.delete(
            f"{TRAVEL_DOCUMENT_ENDPOINT}/{doc['id']}/attachment",
            headers=trip_with_user2_as_crew["leader_headers"],
        )
        assert r.status_code == 404

    @patch("Services.travel_document_service.StorageService.upload")
    @patch("Services.travel_document_service.StorageService.presigned_url", return_value="https://example.com/presigned")
    def test_get_attachment_url(self, mock_presigned, mock_upload, client, trip_with_user2_as_crew):
        trip_id = trip_with_user2_as_crew["trip"]["id"]
        doc = _create_doc(client, trip_id, trip_with_user2_as_crew["leader_headers"])

        with patch("magic.from_buffer", return_value="application/pdf"):
            client.post(
                f"{TRAVEL_DOCUMENT_ENDPOINT}/{doc['id']}/attachment",
                headers=trip_with_user2_as_crew["leader_headers"],
                data={"file": (io.BytesIO(_FAKE_PDF), "booking.pdf")},
                content_type="multipart/form-data",
            )

        r = client.get(
            f"{TRAVEL_DOCUMENT_ENDPOINT}/{doc['id']}/attachment",
            headers=trip_with_user2_as_crew["crew_headers"],
        )
        assert r.status_code == 200
        assert json.loads(r.data)["url"] == "https://example.com/presigned"

    def test_get_attachment_url_when_none_returns_404(self, client, trip_with_user2_as_crew):
        trip_id = trip_with_user2_as_crew["trip"]["id"]
        doc = _create_doc(client, trip_id, trip_with_user2_as_crew["leader_headers"])
        r = client.get(
            f"{TRAVEL_DOCUMENT_ENDPOINT}/{doc['id']}/attachment",
            headers=trip_with_user2_as_crew["leader_headers"],
        )
        assert r.status_code == 404

    def test_upload_requires_file(self, client, trip_with_user2_as_crew):
        trip_id = trip_with_user2_as_crew["trip"]["id"]
        doc = _create_doc(client, trip_id, trip_with_user2_as_crew["leader_headers"])
        r = client.post(
            f"{TRAVEL_DOCUMENT_ENDPOINT}/{doc['id']}/attachment",
            headers=trip_with_user2_as_crew["leader_headers"],
            data={},
            content_type="multipart/form-data",
        )
        assert r.status_code == 400


# ===========================================================================
# ShuttleVehicle — CRUD
# ===========================================================================

class TestShuttleVehicleList:

    def test_empty_list(self, client, trip_with_user2_as_crew):
        trip_id = trip_with_user2_as_crew["trip"]["id"]
        r = client.get(f"{SHUTTLE_ENDPOINT}/{trip_id}/all",
                       headers=trip_with_user2_as_crew["leader_headers"])
        assert r.status_code == 200
        assert json.loads(r.data) == []

    def test_non_member_gets_403(self, client, outsider_headers, trip_with_user2_as_crew):
        trip_id = trip_with_user2_as_crew["trip"]["id"]
        r = client.get(f"{SHUTTLE_ENDPOINT}/{trip_id}/all", headers=outsider_headers)
        assert r.status_code == 403


class TestShuttleVehicleCreate:

    def test_leader_creates_vehicle(self, client, trip_with_user2_as_crew):
        trip_id = trip_with_user2_as_crew["trip"]["id"]
        vehicle = _create_vehicle(client, trip_id, trip_with_user2_as_crew["leader_headers"],
                                  seatsAvailable=4, kayakSpots=2)
        assert vehicle["vehicleDescription"] == "Blue Subaru"
        assert vehicle["seatsAvailable"] == 4
        assert vehicle["kayakSpots"] == 2
        assert vehicle["arrangedById"] is not None
        assert "id" in vehicle

    def test_crew_creates_vehicle_and_becomes_arranger(self, client, trip_with_user2_as_crew):
        trip_id = trip_with_user2_as_crew["trip"]["id"]
        vehicle = _create_vehicle(client, trip_id, trip_with_user2_as_crew["crew_headers"])
        crew_member_id = _member_id(client, trip_id, trip_with_user2_as_crew["crew_headers"])
        assert vehicle["arrangedById"] == crew_member_id

    def test_non_member_gets_403(self, client, outsider_headers, trip_with_user2_as_crew):
        trip_id = trip_with_user2_as_crew["trip"]["id"]
        r = client.post(f"{SHUTTLE_ENDPOINT}/{trip_id}/create", headers=outsider_headers,
                        json={"vehicleDescription": "Hack"})
        assert r.status_code == 403

    def test_external_driver_fields(self, client, trip_with_user2_as_crew):
        trip_id = trip_with_user2_as_crew["trip"]["id"]
        vehicle = _create_vehicle(
            client, trip_id, trip_with_user2_as_crew["leader_headers"],
            driverName="Bob the driver", driverContact="+44123456789",
        )
        assert vehicle["driverName"] == "Bob the driver"
        assert vehicle["driverContact"] == "+44123456789"
        assert vehicle["driverId"] is None


class TestShuttleVehicleUpdate:

    def test_arranger_can_update_vehicle(self, client, trip_with_user2_as_crew):
        trip_id = trip_with_user2_as_crew["trip"]["id"]
        vehicle = _create_vehicle(client, trip_id, trip_with_user2_as_crew["crew_headers"])
        r = client.patch(f"{SHUTTLE_ENDPOINT}/vehicle/{vehicle['id']}",
                         headers=trip_with_user2_as_crew["crew_headers"],
                         json={"seatsAvailable": 5})
        assert r.status_code == 200
        assert json.loads(r.data)["seatsAvailable"] == 5

    def test_leader_can_update_any_vehicle(self, client, trip_with_user2_as_crew):
        trip_id = trip_with_user2_as_crew["trip"]["id"]
        vehicle = _create_vehicle(client, trip_id, trip_with_user2_as_crew["crew_headers"])
        r = client.patch(f"{SHUTTLE_ENDPOINT}/vehicle/{vehicle['id']}",
                         headers=trip_with_user2_as_crew["leader_headers"],
                         json={"pickupPoint": "Pier car park"})
        assert r.status_code == 200
        assert json.loads(r.data)["pickupPoint"] == "Pier car park"

    def test_non_arranger_crew_cannot_update(self, client, trip_with_user2_as_crew):
        trip_id = trip_with_user2_as_crew["trip"]["id"]
        # leader creates the vehicle; crew (user_2) is not the arranger
        vehicle = _create_vehicle(client, trip_id, trip_with_user2_as_crew["leader_headers"])
        r = client.patch(f"{SHUTTLE_ENDPOINT}/vehicle/{vehicle['id']}",
                         headers=trip_with_user2_as_crew["crew_headers"],
                         json={"seatsAvailable": 99})
        assert r.status_code == 403

        # The rejected update must be a true no-op.
        vehicles = _list_vehicles(client, trip_id, trip_with_user2_as_crew["leader_headers"])
        assert vehicles[vehicle["id"]]["seatsAvailable"] != 99


class TestShuttleVehicleDelete:

    def test_arranger_can_delete(self, client, trip_with_user2_as_crew):
        trip_id = trip_with_user2_as_crew["trip"]["id"]
        vehicle = _create_vehicle(client, trip_id, trip_with_user2_as_crew["crew_headers"])
        r = client.delete(f"{SHUTTLE_ENDPOINT}/vehicle/{vehicle['id']}",
                          headers=trip_with_user2_as_crew["crew_headers"])
        assert r.status_code == 204
        assert vehicle["id"] not in _list_vehicles(client, trip_id, trip_with_user2_as_crew["leader_headers"])

    def test_leader_can_delete_any_vehicle(self, client, trip_with_user2_as_crew):
        trip_id = trip_with_user2_as_crew["trip"]["id"]
        vehicle = _create_vehicle(client, trip_id, trip_with_user2_as_crew["crew_headers"])
        r = client.delete(f"{SHUTTLE_ENDPOINT}/vehicle/{vehicle['id']}",
                          headers=trip_with_user2_as_crew["leader_headers"])
        assert r.status_code == 204
        assert vehicle["id"] not in _list_vehicles(client, trip_id, trip_with_user2_as_crew["leader_headers"])

    def test_non_arranger_crew_cannot_delete(self, client, trip_with_user2_as_crew):
        trip_id = trip_with_user2_as_crew["trip"]["id"]
        vehicle = _create_vehicle(client, trip_id, trip_with_user2_as_crew["leader_headers"])
        r = client.delete(f"{SHUTTLE_ENDPOINT}/vehicle/{vehicle['id']}",
                          headers=trip_with_user2_as_crew["crew_headers"])
        assert r.status_code == 403

        # The rejected delete must be a true no-op — the vehicle still exists.
        assert vehicle["id"] in _list_vehicles(client, trip_id, trip_with_user2_as_crew["leader_headers"])


# ===========================================================================
# ShuttlePassenger — add / remove
# ===========================================================================

class TestShuttlePassenger:

    def test_member_can_add_self(self, client, trip_with_user2_as_crew):
        trip_id = trip_with_user2_as_crew["trip"]["id"]
        vehicle = _create_vehicle(client, trip_id, trip_with_user2_as_crew["leader_headers"])
        crew_tm_id = _member_id(client, trip_id, trip_with_user2_as_crew["crew_headers"])
        r = client.post(
            f"{SHUTTLE_ENDPOINT}/vehicle/{vehicle['id']}/passenger",
            headers=trip_with_user2_as_crew["crew_headers"],
            json={"tripMemberId": crew_tm_id},
        )
        assert r.status_code == 201
        data = json.loads(r.data)
        assert data["tripMemberId"] == crew_tm_id

    def test_arranger_can_add_other_member(self, client, trip_with_user2_as_crew):
        trip_id = trip_with_user2_as_crew["trip"]["id"]
        # crew arranges vehicle; leader is added by arranger
        vehicle = _create_vehicle(client, trip_id, trip_with_user2_as_crew["crew_headers"])
        leader_tm_id = _member_id(client, trip_id, trip_with_user2_as_crew["leader_headers"])
        r = client.post(
            f"{SHUTTLE_ENDPOINT}/vehicle/{vehicle['id']}/passenger",
            headers=trip_with_user2_as_crew["crew_headers"],
            json={"tripMemberId": leader_tm_id},
        )
        assert r.status_code == 201

    def test_duplicate_passenger_returns_400(self, client, trip_with_user2_as_crew):
        trip_id = trip_with_user2_as_crew["trip"]["id"]
        vehicle = _create_vehicle(client, trip_id, trip_with_user2_as_crew["leader_headers"])
        crew_tm_id = _member_id(client, trip_id, trip_with_user2_as_crew["crew_headers"])
        client.post(
            f"{SHUTTLE_ENDPOINT}/vehicle/{vehicle['id']}/passenger",
            headers=trip_with_user2_as_crew["crew_headers"],
            json={"tripMemberId": crew_tm_id},
        )
        r = client.post(
            f"{SHUTTLE_ENDPOINT}/vehicle/{vehicle['id']}/passenger",
            headers=trip_with_user2_as_crew["crew_headers"],
            json={"tripMemberId": crew_tm_id},
        )
        assert r.status_code == 400

    def test_non_member_cannot_add_passenger(self, client, outsider_headers, trip_with_user2_as_crew):
        trip_id = trip_with_user2_as_crew["trip"]["id"]
        vehicle = _create_vehicle(client, trip_id, trip_with_user2_as_crew["leader_headers"])
        r = client.post(
            f"{SHUTTLE_ENDPOINT}/vehicle/{vehicle['id']}/passenger",
            headers=outsider_headers,
            json={"tripMemberId": "00000000-0000-0000-0000-000000000001"},
        )
        assert r.status_code == 403

    def test_member_can_remove_self(self, client, trip_with_user2_as_crew):
        trip_id = trip_with_user2_as_crew["trip"]["id"]
        vehicle = _create_vehicle(client, trip_id, trip_with_user2_as_crew["leader_headers"])
        crew_tm_id = _member_id(client, trip_id, trip_with_user2_as_crew["crew_headers"])
        client.post(
            f"{SHUTTLE_ENDPOINT}/vehicle/{vehicle['id']}/passenger",
            headers=trip_with_user2_as_crew["crew_headers"],
            json={"tripMemberId": crew_tm_id},
        )
        r = client.delete(
            f"{SHUTTLE_ENDPOINT}/vehicle/{vehicle['id']}/passenger/{crew_tm_id}",
            headers=trip_with_user2_as_crew["crew_headers"],
        )
        assert r.status_code == 204

        vehicles = _list_vehicles(client, trip_id, trip_with_user2_as_crew["leader_headers"])
        passenger_ids = {p["tripMemberId"] for p in vehicles[vehicle["id"]]["passengers"]}
        assert crew_tm_id not in passenger_ids

    def test_leader_can_remove_any_passenger(self, client, trip_with_user2_as_crew):
        trip_id = trip_with_user2_as_crew["trip"]["id"]
        vehicle = _create_vehicle(client, trip_id, trip_with_user2_as_crew["leader_headers"])
        crew_tm_id = _member_id(client, trip_id, trip_with_user2_as_crew["crew_headers"])
        client.post(
            f"{SHUTTLE_ENDPOINT}/vehicle/{vehicle['id']}/passenger",
            headers=trip_with_user2_as_crew["crew_headers"],
            json={"tripMemberId": crew_tm_id},
        )
        r = client.delete(
            f"{SHUTTLE_ENDPOINT}/vehicle/{vehicle['id']}/passenger/{crew_tm_id}",
            headers=trip_with_user2_as_crew["leader_headers"],
        )
        assert r.status_code == 204

        vehicles = _list_vehicles(client, trip_id, trip_with_user2_as_crew["leader_headers"])
        passenger_ids = {p["tripMemberId"] for p in vehicles[vehicle["id"]]["passengers"]}
        assert crew_tm_id not in passenger_ids

    def test_vehicles_appear_in_list_with_passengers(self, client, trip_with_user2_as_crew):
        trip_id = trip_with_user2_as_crew["trip"]["id"]
        vehicle = _create_vehicle(client, trip_id, trip_with_user2_as_crew["leader_headers"],
                                  seatsAvailable=3)
        crew_tm_id = _member_id(client, trip_id, trip_with_user2_as_crew["crew_headers"])
        client.post(
            f"{SHUTTLE_ENDPOINT}/vehicle/{vehicle['id']}/passenger",
            headers=trip_with_user2_as_crew["crew_headers"],
            json={"tripMemberId": crew_tm_id},
        )
        r = client.get(f"{SHUTTLE_ENDPOINT}/{trip_id}/all",
                       headers=trip_with_user2_as_crew["leader_headers"])
        vehicles = json.loads(r.data)
        found = next((v for v in vehicles if v["id"] == vehicle["id"]), None)
        assert found is not None
        assert len(found["passengers"]) >= 1
