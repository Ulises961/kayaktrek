"""Service-level tests for LogService — endorsement flow and not-found guards
that the HTTP-layer tests in 05_log_resource_test.py do not exercise.
"""
import json

import pytest
from sqlalchemy.exc import NoResultFound

from Resources.log_resource import LOG_ENDPOINT
from Resources.trip_resource import TRIP_ENDPOINT
from Services.log_service import LogService, LogNotEndorsableError

_FAKE_UUID = "00000000-0000-7000-8000-0000000000bb"


@pytest.fixture(scope="function")
def a_log(client, auth_headers, id):
    """A trip-less log authored by user_1 — structurally non-endorsable."""
    resp = client.post(f"{LOG_ENDPOINT}/create", headers=auth_headers,
                        json={"hours": 4, "avgSea": 2, "userId": id})
    assert resp.status_code == 201
    data = json.loads(resp.data)
    yield data
    try:
        client.delete(f"{LOG_ENDPOINT}/{data['id']}", headers=auth_headers)
    except Exception:
        pass


@pytest.fixture(scope="function")
def endorsable_log(client, auth_headers, trip_with_user2_as_crew):
    """A log authored by user_1, linked to a trip that user_1 and user_2 both share."""
    trip_id = trip_with_user2_as_crew["trip"]["id"]
    resp = client.post(f"{LOG_ENDPOINT}/create", headers=auth_headers,
                        json={"hours": 4, "avgSea": 2, "tripId": trip_id})
    assert resp.status_code == 201
    data = json.loads(resp.data)
    yield data
    try:
        client.delete(f"{LOG_ENDPOINT}/{data['id']}", headers=auth_headers)
    except Exception:
        pass


@pytest.fixture(scope="function")
def solo_trip_log(client, auth_headers):
    """A log authored by user_1, linked to a trip on which user_1 is the only member."""
    resp = client.post(f"{TRIP_ENDPOINT}/create",
                       json={"inventory": {}, "itinerary": {"isPublic": False, "totalMiles": 0, "days": []}},
                       headers=auth_headers)
    assert resp.status_code == 201
    trip_id = json.loads(resp.data)["id"]
    log_resp = client.post(f"{LOG_ENDPOINT}/create", headers=auth_headers,
                           json={"hours": 4, "avgSea": 2, "tripId": trip_id})
    assert log_resp.status_code == 201
    data = json.loads(log_resp.data)
    yield data
    try:
        client.delete(f"{LOG_ENDPOINT}/{data['id']}", headers=auth_headers)
        client.delete(f"{TRIP_ENDPOINT}/{trip_id}", headers=auth_headers)
    except Exception:
        pass


# ── get_log_by_id ─────────────────────────────────────────────────────────────

def test_get_log_by_id_not_found_raises(client, auth_headers):
    with pytest.raises(NoResultFound):
        LogService.get_log_by_id(_FAKE_UUID)


# ── endorse_log — same-trip mutual attestation ────────────────────────────────

def test_endorse_log_shared_trip_happy_path_and_idempotent(endorsable_log, id_2):
    """user_2, who shares the log's trip, may endorse — and endorsing twice is a no-op."""
    log_id = endorsable_log["id"]

    LogService.endorse_log(log_id, id_2)
    endorsed = LogService.get_endorsed_logs(id_2)
    assert log_id in [str(l.id) for l in endorsed["items"]]

    LogService.endorse_log(log_id, id_2)
    endorsed = LogService.get_endorsed_logs(id_2)
    assert [str(l.id) for l in endorsed["items"]].count(log_id) == 1

    LogService.unendorse_log(log_id, id_2)


def test_endorse_own_log_forbidden(endorsable_log, id):
    """The author cannot endorse their own log, even on a shared trip."""
    with pytest.raises(PermissionError):
        LogService.endorse_log(endorsable_log["id"], id)


def test_endorse_log_without_shared_trip_forbidden(solo_trip_log, id_2):
    """user_2 cannot endorse a log on a trip they never held a membership for."""
    with pytest.raises(PermissionError):
        LogService.endorse_log(solo_trip_log["id"], id_2)


def test_endorse_log_without_trip_is_not_endorsable(a_log, id_2):
    """A trip-less log is the wrong shape to endorse — 422, not 403."""
    with pytest.raises(LogNotEndorsableError):
        LogService.endorse_log(a_log["id"], id_2)


# ── unendorse_log ─────────────────────────────────────────────────────────────

def test_unendorse_log_user_not_found_raises(a_log):
    with pytest.raises(NoResultFound):
        LogService.unendorse_log(a_log["id"], _FAKE_UUID)


def test_unendorse_log_removes_and_is_idempotent(endorsable_log, id_2):
    log_id = endorsable_log["id"]

    LogService.endorse_log(log_id, id_2)
    LogService.unendorse_log(log_id, id_2)
    assert log_id not in [str(l.id) for l in LogService.get_endorsed_logs(id_2)["items"]]

    # Unendorsing when not endorsed is a no-op, not an error.
    LogService.unendorse_log(log_id, id_2)
    assert log_id not in [str(l.id) for l in LogService.get_endorsed_logs(id_2)["items"]]


# ── get_endorsed_logs ─────────────────────────────────────────────────────────

def test_get_endorsed_logs_user_not_found_raises(client, auth_headers):
    with pytest.raises(NoResultFound):
        LogService.get_endorsed_logs(_FAKE_UUID)
