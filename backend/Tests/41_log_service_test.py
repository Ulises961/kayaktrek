"""Service-level tests for LogService — endorsement flow and not-found guards
that the HTTP-layer tests in 05_log_resource_test.py do not exercise.
"""
import json

import pytest
from sqlalchemy.exc import NoResultFound

from Resources.log_resource import LOG_ENDPOINT
from Services.log_service import LogService

_FAKE_UUID = "00000000-0000-7000-8000-0000000000bb"


@pytest.fixture(scope="function")
def a_log(client, auth_headers, id):
    """A log authored by user_1."""
    resp = client.post(f"{LOG_ENDPOINT}/create", headers=auth_headers,
                        json={"hours": 4, "avgSea": 2, "userId": id})
    assert resp.status_code == 201
    data = json.loads(resp.data)
    yield data
    try:
        client.delete(f"{LOG_ENDPOINT}/{data['id']}", headers=auth_headers)
    except Exception:
        pass


# ── get_log_by_id ─────────────────────────────────────────────────────────────

def test_get_log_by_id_not_found_raises(client, auth_headers):
    with pytest.raises(NoResultFound):
        LogService.get_log_by_id(_FAKE_UUID)


# ── endorse_log ───────────────────────────────────────────────────────────────

def test_endorse_log_user_not_found_raises(a_log):
    with pytest.raises(NoResultFound):
        LogService.endorse_log(a_log["id"], _FAKE_UUID)


def test_endorse_log_happy_path_and_idempotent(a_log, id_2):
    log_id = a_log["id"]

    LogService.endorse_log(log_id, id_2)
    endorsed = LogService.get_endorsed_logs(id_2)
    assert log_id in [str(l.id) for l in endorsed]

    # Endorsing again is a no-op, not a duplicate or an error.
    LogService.endorse_log(log_id, id_2)
    endorsed = LogService.get_endorsed_logs(id_2)
    assert [str(l.id) for l in endorsed].count(log_id) == 1

    # Cleanup so the session-scoped user_2 carries no endorsement into other tests.
    LogService.unendorse_log(log_id, id_2)


# ── unendorse_log ─────────────────────────────────────────────────────────────

def test_unendorse_log_user_not_found_raises(a_log):
    with pytest.raises(NoResultFound):
        LogService.unendorse_log(a_log["id"], _FAKE_UUID)


def test_unendorse_log_removes_and_is_idempotent(a_log, id_2):
    log_id = a_log["id"]

    LogService.endorse_log(log_id, id_2)
    LogService.unendorse_log(log_id, id_2)
    assert log_id not in [str(l.id) for l in LogService.get_endorsed_logs(id_2)]

    # Unendorsing when not endorsed is a no-op, not an error.
    LogService.unendorse_log(log_id, id_2)
    assert log_id not in [str(l.id) for l in LogService.get_endorsed_logs(id_2)]


# ── get_endorsed_logs ─────────────────────────────────────────────────────────

def test_get_endorsed_logs_user_not_found_raises(client, auth_headers):
    with pytest.raises(NoResultFound):
        LogService.get_endorsed_logs(_FAKE_UUID)
