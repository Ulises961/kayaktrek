from http import HTTPStatus
from Resources.day_resource import DAY_ENDPOINT
from Resources.itinerary_resource import ITINERARY_ENDPOINT
from Resources.trip_resource import TRIP_ENDPOINT
from datetime import date, datetime
from Schemas.day_schema import DaySchema
import json
import pytest

@pytest.fixture
def test_trip(client, auth_headers):
    """Create a test trip (no itinerary) and return its ID."""
    trip_data = {"inventory": {}}
    response = client.post(f"{TRIP_ENDPOINT}/create", json=trip_data, headers=auth_headers)
    assert response.status_code == 201
    trip_id = json.loads(response.data)['id']

    yield trip_id

    try:
        client.delete(f"{TRIP_ENDPOINT}/{trip_id}", headers=auth_headers)
    except Exception:
        pass

@pytest.fixture
def test_itinerary_with_day(client, auth_headers, test_trip):
    """Create a test itinerary with one day and return itinerary_id and day_id."""
    daysList = [
        {
            "dayNumber": 1,
            "date": date.fromisoformat('2020-12-31').strftime("%Y-%m-%d"),
            "points": [],
        }
    ]
    itinerary = {
        "days": daysList,
        "tripId": test_trip
    }

    response = client.post(f"{ITINERARY_ENDPOINT}/create", json=itinerary, headers=auth_headers)
    
    assert response.status_code == 201
    itinerary_data = json.loads(response.data)

    yield itinerary_data

     # Cleanup: try to delete the itinerary
    try:
        client.delete(f"{ITINERARY_ENDPOINT}/{itinerary_data['id']}", headers=auth_headers)
    except:
        pass




def test_insert_itinerary_with_day(client, auth_headers, test_trip):
    daysList = [
        {
            "dayNumber": 1,
            "date": date.fromisoformat('2020-12-31').strftime("%Y-%m-%d"),
            "points": [],
        }
    ]
    itinerary = {
        "days": daysList,
        "tripId": test_trip
    }
    response = client.post(f"{ITINERARY_ENDPOINT}/create", json=itinerary, headers=auth_headers)
    assert response.status_code == 201
    body = json.loads(response.data)
    # Assert the created day actually exists, not just that the request routed —
    # this exact gap (201-only) is the motivating example in plans/M16-backend-test-quality.md.
    numbered_days = [d for d in body["days"] if d["dayNumber"] != 0]
    assert len(numbered_days) == 1
    assert numbered_days[0]["dayNumber"] == 1
    assert numbered_days[0]["date"] == "2020-12-31"
    fetched = client.get(f"{ITINERARY_ENDPOINT}/{body['id']}", headers=auth_headers)
    assert fetched.status_code == 200
    assert len([d for d in fetched.json["days"] if d["dayNumber"] != 0]) == 1
    client.delete(f"{ITINERARY_ENDPOINT}/{body['id']}", headers=auth_headers)


def test_insert_weather_to_day(client, auth_headers, test_itinerary_with_day):
    day_id = test_itinerary_with_day["days"][0]['id']
    weather = {
        "weatherStates": [],
        "dayId": day_id,
        "model": "ICON"
    }

    day = {
        "id": day_id,
        "weather": weather
    }
    response = client.patch(f"{DAY_ENDPOINT}/{day_id}", json=day, headers=auth_headers)
    assert response.status_code == HTTPStatus.OK
    body = json.loads(response.data)
    assert body["weather"] is not None
    assert body["weather"]["model"] == "ICON"
    # Persisted, not just echoed back — read it through a fresh GET.
    refetched = client.get(f"{DAY_ENDPOINT}/{day_id}", headers=auth_headers)
    assert refetched.json["weather"]["model"] == "ICON"


def test_insert_sea_to_day(client, auth_headers, test_itinerary_with_day):
    day_id = test_itinerary_with_day["days"][0]['id']
    itinerary_id = test_itinerary_with_day['id']
    low_tide = datetime.now().time().strftime('%H:%M')
    high_tide = datetime.now().time().strftime('%H:%M')
    sea = {
        "sea_states": [],
        "dayId": day_id,
        "lowTide": low_tide,
        "highTide": high_tide,
    }

    day = {
        "id": day_id,
        "itineraryId": itinerary_id,
        "sea": sea
    }
    response = client.patch(f"{DAY_ENDPOINT}/{day_id}", json=day, headers=auth_headers)
    assert response.status_code == HTTPStatus.OK
    body = json.loads(response.data)
    assert body["sea"] is not None
    assert body["sea"]["lowTide"] == low_tide
    assert body["sea"]["highTide"] == high_tide
    refetched = client.get(f"{DAY_ENDPOINT}/{day_id}", headers=auth_headers)
    assert refetched.json["sea"]["lowTide"] == low_tide


def test_get_day_by_key(client, auth_headers, test_itinerary_with_day):
    itinerary_id = test_itinerary_with_day['id']
    expected_day_id = test_itinerary_with_day["days"][0]['id']
    day_date = date.fromisoformat('2020-12-31').strftime("%Y-%m-%d")
    json_data = {
        "itineraryId": itinerary_id,
        'dayNumber': 1,
        'date': day_date
    }

    response = client.post(
        f"{DAY_ENDPOINT}/by-key", json=json_data, headers=auth_headers)
    assert response.status_code == 200
    body = json.loads(response.data)
    # The natural-key lookup must resolve to the actual day, not just any 200.
    assert body["id"] == expected_day_id
    assert body["dayNumber"] == 1
    assert body["date"] == day_date


def test_get_all_days(client, auth_headers, test_itinerary_with_day):
    itinerary_id = test_itinerary_with_day['id']
    response = client.get(
        f"{DAY_ENDPOINT}/itinerary/{itinerary_id}", headers=auth_headers)
    assert response.status_code == HTTPStatus.OK
    assert len(json.loads(response.data)) == 1

def test_update_day(client, auth_headers, test_itinerary_with_day):
    day_id = test_itinerary_with_day["days"][0]['id']
    itinerary_id = test_itinerary_with_day['id']
    day_date = date.fromisoformat('2020-12-31').strftime("%Y-%m-%d")
    sea = None
    updated_day = {'id': day_id, 'date': day_date, 'itinerary_id': itinerary_id, 'dayNumber': 1, 'sea': sea} 
    response = client.patch(f"{DAY_ENDPOINT}/{day_id}", json=updated_day, headers=auth_headers)
    json_data = json.loads(response.data)
    print("json data ",json_data)
    assert json_data['sea'] == sea
    assert response.status_code == HTTPStatus.OK

def test_delete_day_by_id(client, auth_headers, test_itinerary_with_day):
    day_id = test_itinerary_with_day["days"][0]['id']
    response = client.delete(
        f"{DAY_ENDPOINT}/{day_id}", headers=auth_headers)
    assert response.status_code == HTTPStatus.OK
    # The delete must actually take effect, not just return 200.
    refetched = client.get(f"{DAY_ENDPOINT}/{day_id}", headers=auth_headers)
    assert refetched.status_code == 404
