"""§8.3 POST /api/v1/live/trip/<id>/close-day."""
import json
from datetime import date, datetime, timedelta, timezone
from unittest.mock import patch

from Resources.live_resource import LIVE_ENDPOINT
from Resources.trip_resource import TRIP_ENDPOINT


def _today_utc() -> date:
    # This fixture's trip never gets a located point, so ExpeditionLogService.
    # close_day's trip_today() fallback resolves to UTC — date.today() (local)
    # would drift a day off it near local midnight in a non-UTC timezone.
    return datetime.now(timezone.utc).date()


def _create_trip_with_day(client, headers, day_date):
    payload = {
        "inventory": {},
        "itinerary": {
            "isPublic": False,
            "totalMiles": 0,
            "days": [{"dayNumber": 1, "date": day_date.isoformat(), "points": []}],
        },
    }
    response = client.post(f"{TRIP_ENDPOINT}/create", json=payload, headers=headers)
    assert response.status_code == 201, response.data
    return json.loads(response.data)


def _promote_to_happening(client, headers, trip_id):
    response = client.post(f"{TRIP_ENDPOINT}/{trip_id}/state", json={"state": "happening"}, headers=headers)
    assert response.status_code == 200, response.data


def _close_day(client, headers, trip_id, day_date=None):
    body = {"date": day_date.isoformat()} if day_date else {}
    return client.post(f"{LIVE_ENDPOINT}/trip/{trip_id}/close-day", json=body, headers=headers)


def test_close_day_requires_auth(client, auth_headers):
    trip = _create_trip_with_day(client, auth_headers, date.today())
    response = client.post(f"{LIVE_ENDPOINT}/trip/{trip['id']}/close-day", json={})
    assert response.status_code in (401, 403)


def test_close_day_non_member_is_forbidden(client, auth_headers, outsider_headers):
    trip = _create_trip_with_day(client, auth_headers, date.today())
    response = _close_day(client, outsider_headers, trip["id"])
    assert response.status_code == 403


def test_close_day_crew_is_forbidden(client, trip_with_user2_as_crew):
    trip = trip_with_user2_as_crew["trip"]
    response = _close_day(client, trip_with_user2_as_crew["crew_headers"], trip["id"])
    assert response.status_code == 403


def test_close_day_building_trip_is_409(client, auth_headers):
    trip = _create_trip_with_day(client, auth_headers, date.today())
    response = _close_day(client, auth_headers, trip["id"])
    assert response.status_code == 409
    assert "happening" in response.get_json()["message"].lower()


def test_close_day_no_day_for_resolved_date_is_409(client, auth_headers):
    trip = _create_trip_with_day(client, auth_headers, date.today() - timedelta(days=5))
    _promote_to_happening(client, auth_headers, trip["id"])

    response = _close_day(client, auth_headers, trip["id"])  # defaults to today — no Day then
    assert response.status_code == 409
    assert "itinerary day" in response.get_json()["message"].lower()


def test_close_day_invalid_date_format_is_400(client, auth_headers):
    trip = _create_trip_with_day(client, auth_headers, date.today())
    _promote_to_happening(client, auth_headers, trip["id"])

    response = client.post(
        f"{LIVE_ENDPOINT}/trip/{trip['id']}/close-day", json={"date": "not-a-date"}, headers=auth_headers
    )
    assert response.status_code == 400


def test_close_day_dispatches_for_today_by_default(client, auth_headers):
    today = _today_utc()
    trip = _create_trip_with_day(client, auth_headers, today)
    _promote_to_happening(client, auth_headers, trip["id"])

    with patch("Resources.live_resource.generate_trip_day_logs") as mock_task:
        mock_task.delay.return_value.id = "task-123"
        response = _close_day(client, auth_headers, trip["id"])

    assert response.status_code == 202
    body = response.get_json()
    assert body["taskId"] == "task-123"
    assert body["date"] == today.isoformat()
    mock_task.delay.assert_called_once()
    args, kwargs = mock_task.delay.call_args
    assert args == (trip["id"], today.isoformat())
    assert "request_id" in kwargs


def test_close_day_dispatches_for_explicit_date(client, auth_headers):
    target_date = date.today() - timedelta(days=2)
    trip = _create_trip_with_day(client, auth_headers, target_date)
    _promote_to_happening(client, auth_headers, trip["id"])

    with patch("Resources.live_resource.generate_trip_day_logs") as mock_task:
        mock_task.delay.return_value.id = "task-456"
        response = _close_day(client, auth_headers, trip["id"], day_date=target_date)

    assert response.status_code == 202
    assert response.get_json()["date"] == target_date.isoformat()
    args, _kwargs = mock_task.delay.call_args
    assert args == (trip["id"], target_date.isoformat())
