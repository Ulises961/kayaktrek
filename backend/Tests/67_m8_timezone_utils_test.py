"""§8.1 Timezone helper + trip-transition tz resolution tests."""
import json
from datetime import date, datetime, timedelta, timezone

from Resources.itinerary_resource import ITINERARY_ENDPOINT
from Resources.point_resource import POINT_ENDPOINT
from Resources.trip_resource import TRIP_ENDPOINT
from Services import trip_service
from Services.Utils import timezone_utils


# --- resolve_timezone ---


def test_resolve_timezone_known_coord(monkeypatch):
    """Mock the TimezoneFinder singleton — avoid the ~50 MB geometry load in CI."""
    class _StubFinder:
        def timezone_at(self, *, lat, lng):
            assert (lat, lng) == (50.72, -1.88)
            return "Europe/London"

    monkeypatch.setattr(timezone_utils, "_finder", lambda: _StubFinder())
    assert timezone_utils.resolve_timezone(50.72, -1.88) == "Europe/London"


def test_resolve_timezone_unresolvable_coord_returns_none(monkeypatch):
    class _StubFinder:
        def timezone_at(self, *, lat, lng):
            return None

    monkeypatch.setattr(timezone_utils, "_finder", lambda: _StubFinder())
    assert timezone_utils.resolve_timezone(0.0, -40.0) is None


# --- trip_today ---


class _FixedDatetime(datetime):
    """now() pinned to 2026-01-01 23:00 UTC — close enough to midnight that a
    positive-offset zone rolls over to the next day while UTC hasn't."""

    @classmethod
    def now(cls, tz=None):
        base = datetime(2026, 1, 1, 23, 0, tzinfo=timezone.utc)
        return base.astimezone(tz) if tz is not None else base


def test_trip_today_falls_back_to_utc_when_unresolved():
    trip = type("Trip", (), {"timezone_name": None})()
    assert timezone_utils.trip_today(trip) == datetime.now(timezone.utc).date()


def test_trip_today_uses_resolved_zone(monkeypatch):
    monkeypatch.setattr(timezone_utils, "datetime", _FixedDatetime)
    trip = type("Trip", (), {"timezone_name": "Pacific/Kiritimati"})()  # UTC+14
    assert timezone_utils.trip_today(trip) == date(2026, 1, 2)

    trip_utc = type("Trip", (), {"timezone_name": None})()
    assert timezone_utils.trip_today(trip_utc) == date(2026, 1, 1)


# --- day_bounds_utc ---
#
# Used by ExpeditionLogService to bucket UTC-stamped PositionPing rows into a
# trip-local calendar day. Previously exercised only indirectly through
# expedition-log tests, all of which leave trip.timezone_name unset (UTC
# fallback) — so a bug that only manifests for a resolved, offset timezone
# would have slipped through untested.


def test_day_bounds_utc_positive_offset_zone():
    trip = type("Trip", (), {"timezone_name": "Pacific/Kiritimati"})()  # UTC+14, no DST
    start, end = timezone_utils.day_bounds_utc(trip, date(2026, 1, 2))
    assert start == datetime(2026, 1, 1, 10, 0, tzinfo=timezone.utc)
    assert end == datetime(2026, 1, 2, 10, 0, tzinfo=timezone.utc)


def test_day_bounds_utc_negative_offset_zone():
    trip = type("Trip", (), {"timezone_name": "Pacific/Honolulu"})()  # UTC-10, no DST
    start, end = timezone_utils.day_bounds_utc(trip, date(2026, 6, 15))
    assert start == datetime(2026, 6, 15, 10, 0, tzinfo=timezone.utc)
    assert end == datetime(2026, 6, 16, 10, 0, tzinfo=timezone.utc)


def test_day_bounds_utc_falls_back_to_utc_when_unresolved():
    trip = type("Trip", (), {"timezone_name": None})()
    start, end = timezone_utils.day_bounds_utc(trip, date(2026, 6, 15))
    assert start == datetime(2026, 6, 15, 0, 0, tzinfo=timezone.utc)
    assert end == datetime(2026, 6, 16, 0, 0, tzinfo=timezone.utc)


def test_day_bounds_utc_spans_only_23_hours_on_a_spring_forward_dst_day():
    """A day containing a DST 'spring forward' transition is 23 wall-clock
    hours wide in UTC. Asserting exactly that (not a naive +24h) proves each
    endpoint's UTC offset is resolved from its own local date rather than
    inherited from the day's start — the bug this would catch is subtle:
    `start_local + timedelta(days=1)` looks like it should just work, and
    silently degrading to fixed-offset arithmetic wouldn't raise anywhere,
    it would just misbucket pings for an hour on two days a year."""
    trip = type("Trip", (), {"timezone_name": "America/New_York"})()  # DST starts 2026-03-08 02:00 local
    start, end = timezone_utils.day_bounds_utc(trip, date(2026, 3, 8))
    assert start == datetime(2026, 3, 8, 5, 0, tzinfo=timezone.utc)  # EST, UTC-5
    assert end == datetime(2026, 3, 9, 4, 0, tzinfo=timezone.utc)  # EDT, UTC-4
    assert (end - start) == timedelta(hours=23)


# --- TripService transition tz resolution ---


def _create_trip_with_day(client, auth_headers):
    trip_resp = client.post(f"{TRIP_ENDPOINT}/create", json={"inventory": {}}, headers=auth_headers)
    assert trip_resp.status_code == 201, trip_resp.data
    trip_id = trip_resp.json["id"]

    itin_resp = client.post(
        f"{ITINERARY_ENDPOINT}/create",
        json={"name": "Tz Test Route", "tripId": trip_id},
        headers=auth_headers,
    )
    assert itin_resp.status_code == 201, itin_resp.data
    day0_id = next(d["id"] for d in itin_resp.json["days"] if d["dayNumber"] == 0)
    return trip_id, day0_id


def test_transition_to_happening_resolves_timezone_from_first_point(client, auth_headers, monkeypatch):
    trip_id, day0_id = _create_trip_with_day(client, auth_headers)
    client.post(
        f"{POINT_ENDPOINT}/create", headers=auth_headers,
        json={"dayId": day0_id, "type": "stop", "latitude": 50.72, "longitude": -1.88},
    )

    monkeypatch.setattr(
        trip_service, "resolve_timezone",
        lambda lat, lon: "Europe/London" if (lat, lon) == (50.72, -1.88) else None,
    )

    response = client.post(f"{TRIP_ENDPOINT}/{trip_id}/state", json={"state": "happening"}, headers=auth_headers)
    assert response.status_code == 200
    assert json.loads(response.data)["timezoneName"] == "Europe/London"


def test_transition_to_happening_leaves_timezone_null_when_no_located_points(client, auth_headers, monkeypatch):
    trip_id, _day0_id = _create_trip_with_day(client, auth_headers)

    monkeypatch.setattr(trip_service, "resolve_timezone", lambda lat, lon: "Europe/London")

    response = client.post(f"{TRIP_ENDPOINT}/{trip_id}/state", json={"state": "happening"}, headers=auth_headers)
    assert response.status_code == 200
    assert json.loads(response.data)["timezoneName"] is None
