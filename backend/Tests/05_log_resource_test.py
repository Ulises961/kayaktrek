from Resources.log_resource import LOG_ENDPOINT
import pytest
import json
from uuid import UUID
from Api.database import db as _db
from Models.log import Log


@pytest.fixture
def test_log(client, auth_headers, id):
    """Create a test log for testing"""
    log = {"hours": 7, "avg_sea": 5, "user_id": id}
    response = client.post(f"{LOG_ENDPOINT}/create", headers=auth_headers, json=log)
    assert response.status_code == 201
    log_data = json.loads(response.data)
    
    yield log_data
    
    # Cleanup: try to delete the log
    try:
        client.delete(f"{LOG_ENDPOINT}/{log_data['id']}", headers=auth_headers)
    except:
        pass


def test_create_log(client, auth_headers, app):
    """Test creating a new log — asserts response AND DB state (rubric 1)."""
    log = {"hours": 10, "avgSea": 3}
    response = client.post(f"{LOG_ENDPOINT}/create", headers=auth_headers, json=log)
    assert response.status_code == 201

    data = json.loads(response.data)
    assert data['hours'] == 10
    assert data['avgSea'] == 3
    assert 'id' in data

    # Rubric 1: Status 201 is not an assertion about behaviour. Query the log back.
    with app.app_context():
        fetched = _db.session.query(Log).filter_by(id=UUID(data['id'])).first()
        assert fetched is not None
        assert float(fetched.hours) == 10.0
        assert fetched.avg_sea == 3

    # Cleanup
    client.delete(f"{LOG_ENDPOINT}/{data['id']}", headers=auth_headers)


def test_get_all_logs(client, auth_headers, test_log):
    """Test retrieving all logs for current user"""
    response = client.get(f"{LOG_ENDPOINT}/all", headers=auth_headers)
    assert response.status_code == 200
    
    data = json.loads(response.data)
    assert "items" in data
    assert "total" in data
    assert len(data["items"]) >= 1  # At least the test_log fixture


def test_get_endorsed_logs(client, auth_headers):
    """Test retrieving endorsed logs — paginated envelope (M12 §K)"""
    response = client.get(f"{LOG_ENDPOINT}/endorsed", headers=auth_headers)
    assert response.status_code == 200

    data = json.loads(response.data)
    assert "items" in data
    assert "total" in data


def test_update_log(client, auth_headers, test_log, app):
    """Test updating an existing log — asserts both response and DB state (rubric 1)."""
    log_id = test_log['id']
    updated_data = {"hours": 15, "avgSea": 8}

    response = client.patch(f"{LOG_ENDPOINT}/{log_id}", headers=auth_headers, json=updated_data)
    assert response.status_code == 200

    data = json.loads(response.data)
    assert data['hours'] == 15
    assert data['avgSea'] == 8

    # Verify the update was persisted (rubric 1: status 200 is not a behavior assertion)
    with app.app_context():
        fetched = _db.session.query(Log).filter_by(id=UUID(log_id)).first()
        assert fetched is not None
        assert float(fetched.hours) == 15.0
        assert fetched.avg_sea == 8


def test_delete_log(client, auth_headers, ):
    """Test deleting a log"""
    # Create a log to delete
    log = {"hours": 5, "avgSea": 2}
    create_response = client.post(f"{LOG_ENDPOINT}/create", headers=auth_headers, json=log)
    log_id = json.loads(create_response.data)['id']

    # Delete it
    response = client.delete(f"{LOG_ENDPOINT}/{log_id}", headers=auth_headers)
    assert response.status_code == 200

    # Verify deletion by checking all logs
    get_response = client.get(f"{LOG_ENDPOINT}/all", headers=auth_headers)
    data = json.loads(get_response.data)
    log_ids = [log['id'] for log in data["items"]]
    assert log_id not in log_ids


def test_get_stats(client, auth_headers):
    """Stats endpoint returns the aggregate camelCase shape for the caller."""
    response = client.get(f"{LOG_ENDPOINT}/stats", headers=auth_headers)
    assert response.status_code == 200
    data = json.loads(response.data)
    for key in ("totalDistance", "totalHours", "logCount", "tripCount",
                "endorsementsReceived", "conditionsDistribution", "activityByMonth"):
        assert key in data


def test_endorse_log_shared_trip(client, trip_with_user2_as_crew):
    """A crew member may endorse the leader's trip-linked log; schema exposes the endorser."""
    leader_headers = trip_with_user2_as_crew["leader_headers"]
    crew_headers = trip_with_user2_as_crew["crew_headers"]
    trip_id = trip_with_user2_as_crew["trip"]["id"]

    create = client.post(f"{LOG_ENDPOINT}/create", headers=leader_headers,
                         json={"hours": 4, "avgSea": 2, "tripId": trip_id})
    assert create.status_code == 201
    created = json.loads(create.data)
    assert created["tripId"] == trip_id
    assert created["endorsementCount"] == 0
    assert created["endorsers"] == []
    log_id = created["id"]

    endorse = client.post(f"{LOG_ENDPOINT}/{log_id}/endorse", headers=crew_headers)
    assert endorse.status_code == 200

    fetched = json.loads(client.get(f"{LOG_ENDPOINT}/{log_id}", headers=leader_headers).data)
    assert fetched["endorsementCount"] == 1
    assert len(fetched["endorsers"]) == 1
    # Endorser is shallow — identity only, never private contact fields.
    assert set(fetched["endorsers"][0].keys()) <= {"id", "username", "name", "avatarUrl"}

    # Withdraw is caller-scoped and idempotent.
    assert client.delete(f"{LOG_ENDPOINT}/{log_id}/endorse", headers=crew_headers).status_code == 200
    refetched = json.loads(client.get(f"{LOG_ENDPOINT}/{log_id}", headers=leader_headers).data)
    assert refetched["endorsementCount"] == 0


def test_endorse_own_log_forbidden(client, trip_with_user2_as_crew):
    """The author endorsing their own trip-linked log is 403."""
    leader_headers = trip_with_user2_as_crew["leader_headers"]
    trip_id = trip_with_user2_as_crew["trip"]["id"]
    create = client.post(f"{LOG_ENDPOINT}/create", headers=leader_headers,
                         json={"hours": 4, "tripId": trip_id})
    log_id = json.loads(create.data)["id"]

    response = client.post(f"{LOG_ENDPOINT}/{log_id}/endorse", headers=leader_headers)
    assert response.status_code == 403


def test_endorse_log_without_trip_unprocessable(client, auth_headers, auth_headers_2):
    """A trip-less log cannot be endorsed — 422 (wrong shape), not 403."""
    create = client.post(f"{LOG_ENDPOINT}/create", headers=auth_headers, json={"hours": 4})
    log_id = json.loads(create.data)["id"]

    response = client.post(f"{LOG_ENDPOINT}/{log_id}/endorse", headers=auth_headers_2)
    assert response.status_code == 422

    client.delete(f"{LOG_ENDPOINT}/{log_id}", headers=auth_headers)


# ============================================================================
# Error-path tests (rubric 3: every service error branch gets a test)
# ============================================================================

def test_get_log_nonexistent_returns_404(client, auth_headers):
    """Fetching a non-existent log returns 404."""
    fake_id = "00000000-0000-7000-8000-000000000099"
    response = client.get(f"{LOG_ENDPOINT}/{fake_id}", headers=auth_headers)
    assert response.status_code == 404


def test_update_log_nonexistent_returns_404(client, auth_headers):
    """Updating a non-existent log returns 404."""
    fake_id = "00000000-0000-7000-8000-000000000099"
    response = client.patch(f"{LOG_ENDPOINT}/{fake_id}", headers=auth_headers,
                           json={"hours": 20})
    assert response.status_code == 404


def test_delete_log_nonexistent_returns_404(client, auth_headers):
    """Deleting a non-existent log returns 404."""
    fake_id = "00000000-0000-7000-8000-000000000099"
    response = client.delete(f"{LOG_ENDPOINT}/{fake_id}", headers=auth_headers)
    assert response.status_code == 404


def test_create_log_invalid_hours_returns_400(client, auth_headers):
    """Invalid hours value (string instead of number) returns 400."""
    response = client.post(f"{LOG_ENDPOINT}/create", headers=auth_headers,
                          json={"hours": "not a number"})
    assert response.status_code == 400


def test_create_log_requires_auth(client):
    """Creating a log without auth returns 401/403."""
    response = client.post(f"{LOG_ENDPOINT}/create", json={"hours": 5})
    assert response.status_code in (401, 403)
