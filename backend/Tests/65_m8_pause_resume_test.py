import json
from datetime import date, timedelta

from Resources.trip_resource import TRIP_ENDPOINT


def _create_trip(client, auth_headers, **kwargs):
    """Helper — create a minimal trip and return the parsed response body."""
    trip = {"inventory": {}, "itinerary": {"isPublic": True, "totalMiles": 0, "days": []}, **kwargs}
    response = client.post(f"{TRIP_ENDPOINT}/create", json=trip, headers=auth_headers)
    assert response.status_code == 201
    return json.loads(response.data)


def _create_happening_trip(client, auth_headers, **kwargs):
    data = _create_trip(client, auth_headers, **kwargs)
    response = client.post(f"{TRIP_ENDPOINT}/{data['id']}/state", json={"state": "happening"}, headers=auth_headers)
    assert response.status_code == 200
    return json.loads(response.data)


def _pause(client, auth_headers, trip_id):
    return client.post(f"{TRIP_ENDPOINT}/{trip_id}/pause", headers=auth_headers)


# --- Pause ---


def test_leader_can_pause_happening_trip(client, auth_headers):
    trip = _create_happening_trip(client, auth_headers)
    response = _pause(client, auth_headers, trip["id"])
    assert response.status_code == 200
    data = json.loads(response.data)
    assert data["isPaused"] is True
    assert data["pausedAt"] == date.today().isoformat()


def test_cannot_pause_a_building_trip(client, auth_headers):
    trip = _create_trip(client, auth_headers)
    response = _pause(client, auth_headers, trip["id"])
    assert response.status_code == 409


def test_cannot_pause_an_already_paused_trip(client, auth_headers):
    trip = _create_happening_trip(client, auth_headers)
    _pause(client, auth_headers, trip["id"])
    response = _pause(client, auth_headers, trip["id"])
    assert response.status_code == 409


def test_crew_cannot_pause_trip(client, trip_with_crew):
    trip_id = trip_with_crew["trip"]["id"]
    client.post(f"{TRIP_ENDPOINT}/{trip_id}/state", json={"state": "happening"}, headers=trip_with_crew["leader_headers"])
    response = client.post(f"{TRIP_ENDPOINT}/{trip_id}/pause", headers=trip_with_crew["crew_headers"])
    assert response.status_code == 403


def test_non_member_cannot_pause_trip(client, auth_headers, outsider_headers):
    trip = _create_happening_trip(client, auth_headers)
    response = _pause(client, outsider_headers, trip["id"])
    assert response.status_code == 403


# --- Resume ---


def test_cannot_resume_a_trip_that_is_not_paused(client, auth_headers):
    trip = _create_happening_trip(client, auth_headers)
    response = client.post(f"{TRIP_ENDPOINT}/{trip['id']}/resume", json={}, headers=auth_headers)
    assert response.status_code == 409


def test_resume_before_pause_date_is_rejected(client, auth_headers):
    trip = _create_happening_trip(client, auth_headers)
    _pause(client, auth_headers, trip["id"])
    yesterday = (date.today() - timedelta(days=1)).isoformat()
    response = client.post(f"{TRIP_ENDPOINT}/{trip['id']}/resume", json={"resumeDate": yesterday}, headers=auth_headers)
    assert response.status_code == 409


def test_resume_gap_shift_math(client, auth_headers):
    paused_at = date.today()
    day1 = paused_at - timedelta(days=1)
    day2 = paused_at + timedelta(days=1)
    day3 = paused_at + timedelta(days=2)
    date_to = day3.isoformat()

    trip = _create_trip(
        client,
        auth_headers,
        itinerary={
            "isPublic": True,
            "totalMiles": 0,
            "days": [
                {"dayNumber": 1, "date": day1.isoformat()},
                {"dayNumber": 2, "date": day2.isoformat()},
                {"dayNumber": 3, "date": day3.isoformat()},
            ],
        },
        dateFrom=day1.isoformat(),
        dateTo=date_to,
    )
    client.post(f"{TRIP_ENDPOINT}/{trip['id']}/state", json={"state": "happening"}, headers=auth_headers)
    _pause(client, auth_headers, trip["id"])

    resume_date = paused_at + timedelta(days=3)
    response = client.post(
        f"{TRIP_ENDPOINT}/{trip['id']}/resume",
        json={"resumeDate": resume_date.isoformat()},
        headers=auth_headers,
    )
    assert response.status_code == 200
    data = json.loads(response.data)
    assert data["isPaused"] is False
    assert data["pausedAt"] is None

    days_by_number = {day["dayNumber"]: day for day in data["itinerary"]["days"]}
    # gap = resume_date - paused_at = 3 days
    assert days_by_number[1]["date"] == day1.isoformat()  # before paused_at — untouched
    assert days_by_number[2]["date"] == (day2 + timedelta(days=3)).isoformat()
    assert days_by_number[3]["date"] == (day3 + timedelta(days=3)).isoformat()
    assert data["dateTo"] == (date.fromisoformat(date_to) + timedelta(days=3)).isoformat()


def test_crew_cannot_resume_trip(client, trip_with_crew):
    trip_id = trip_with_crew["trip"]["id"]
    client.post(f"{TRIP_ENDPOINT}/{trip_id}/state", json={"state": "happening"}, headers=trip_with_crew["leader_headers"])
    client.post(f"{TRIP_ENDPOINT}/{trip_id}/pause", headers=trip_with_crew["leader_headers"])
    response = client.post(f"{TRIP_ENDPOINT}/{trip_id}/resume", json={}, headers=trip_with_crew["crew_headers"])
    assert response.status_code == 403


# --- Abort ---


def test_abort_requires_paused_trip(client, auth_headers):
    trip = _create_happening_trip(client, auth_headers)
    response = client.post(f"{TRIP_ENDPOINT}/{trip['id']}/abort", headers=auth_headers)
    assert response.status_code == 409


def test_abort_sets_past_and_interrupted(client, auth_headers):
    trip = _create_happening_trip(client, auth_headers)
    _pause(client, auth_headers, trip["id"])
    response = client.post(f"{TRIP_ENDPOINT}/{trip['id']}/abort", headers=auth_headers)
    assert response.status_code == 200
    data = json.loads(response.data)
    assert data["state"] == "past"
    assert data["outcome"] == "interrupted"


def test_crew_cannot_abort_trip(client, trip_with_crew):
    trip_id = trip_with_crew["trip"]["id"]
    client.post(f"{TRIP_ENDPOINT}/{trip_id}/state", json={"state": "happening"}, headers=trip_with_crew["leader_headers"])
    client.post(f"{TRIP_ENDPOINT}/{trip_id}/pause", headers=trip_with_crew["leader_headers"])
    response = client.post(f"{TRIP_ENDPOINT}/{trip_id}/abort", headers=trip_with_crew["crew_headers"])
    assert response.status_code == 403


# --- Normal transition still infers outcome=completed ---


def test_normal_happening_to_past_sets_outcome_completed(client, auth_headers):
    trip = _create_happening_trip(client, auth_headers)
    response = client.post(f"{TRIP_ENDPOINT}/{trip['id']}/state", json={"state": "past"}, headers=auth_headers)
    assert response.status_code == 200
    data = json.loads(response.data)
    assert data["state"] == "past"
    assert data["outcome"] == "completed"
