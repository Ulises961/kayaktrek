"""M35: the wind and swell velocity grids ride the mobile pull as a compact descriptor.

Every grid the wind-vectors / wave-vectors endpoints return is one (u, v) stamped across a
24x24 grid over the day's bounding box, with land cells nulled for waves. So the sync sends
that, not 24 hours of full grids: per day the box, the grid size and the land mask, and per
hour the two (u, v) pairs. The phone stamps them back into the grid. What keeps the two
paths from drifting is `test_the_descriptor_expands_to_what_the_endpoints_return` below.
"""
import types
from datetime import time
from uuid import UUID

import pytest

from Api.database import db
from Models.day import Day
from Models.itinerary import Itinerary
from Models.point import Point, PointType
from Models.sea import Sea
from Models.sea_state import SeaState
from Models.trip import Trip
from Models.trip_member import MemberRoleType, TripMember
from Models.weather import Weather
from Models.weather_state import WeatherState
from Resources.mobile_sync_resource import MOBILE_SYNC_ENDPOINT
from Services.tidal_service import VELOCITY_GRID_RESOLUTION, TidalService

CELLS = VELOCITY_GRID_RESOLUTION * VELOCITY_GRID_RESOLUTION
# Off the Isle of Man: the day's box takes in the island and open sea, so the land mask has
# both kinds of cell in it.
ISLE_OF_MAN_POINTS = [(54.2, -4.7), (54.0, -4.4)]
OPEN_ATLANTIC_BOX = (47.0, 48.0, -10.0, -9.0)


def _pull(client, headers, trip_id, last_pulled_at=None):
    query = f"?lastPulledAt={last_pulled_at}" if last_pulled_at is not None else ""
    return client.get(f"{MOBILE_SYNC_ENDPOINT}/trip/{trip_id}/pull{query}", headers=headers)


def _wind_state(hour, wind_force, wind_direction):
    return types.SimpleNamespace(time=time(hour, 0), wind_force=wind_force, wind_direction=wind_direction)


def _wave_state(hour, wave_height, wave_direction):
    return types.SimpleNamespace(time=time(hour, 0), wave_height=wave_height, wave_direction=wave_direction)


# ── TidalService: the per-hour flow ─────────────────────────────────────────

def test_wind_flow_is_none_without_usable_states():
    assert TidalService.wind_flow_at_hour([], 12) is None
    assert TidalService.wind_flow_at_hour([_wind_state(12, None, 90.0)], 12) is None
    assert TidalService.wind_flow_at_hour([_wind_state(12, 10.0, None)], 12) is None


def test_wind_flow_converts_km_per_hour_to_metres_per_second_toward_the_direction():
    # 36 km/h is 10 m/s; toward 90 degrees is due east.
    u, v = TidalService.wind_flow_at_hour([_wind_state(12, 36.0, 90.0)], 12)

    assert u == pytest.approx(10.0)
    assert v == pytest.approx(0.0, abs=1e-5)


def test_wind_flow_takes_the_closest_hour():
    states = [_wind_state(6, 18.0, 90.0), _wind_state(18, 36.0, 90.0)]

    assert TidalService.wind_flow_at_hour(states, 7)[0] == pytest.approx(5.0)
    assert TidalService.wind_flow_at_hour(states, 17)[0] == pytest.approx(10.0)


def test_wave_flow_is_none_without_usable_states():
    assert TidalService.wave_flow_at_hour([], 12) is None
    assert TidalService.wave_flow_at_hour([_wave_state(12, 1.5, None)], 12) is None
    assert TidalService.wave_flow_at_hour([_wave_state(12, None, 90.0)], 12) is None


def test_wave_flow_treats_height_as_speed_toward_the_direction():
    # 2 m toward 180 degrees: due south, so the northward component is negative.
    u, v = TidalService.wave_flow_at_hour([_wave_state(12, 2.0, 180.0)], 12)

    assert u == pytest.approx(0.0, abs=1e-5)
    assert v == pytest.approx(-2.0)


# ── TidalService: the box and the mask ──────────────────────────────────────

def test_day_bounding_box_pads_the_route_points():
    day = types.SimpleNamespace(
        points=[types.SimpleNamespace(latitude=54.0, longitude=-4.5), types.SimpleNamespace(latitude=54.2, longitude=-4.3)]
    )

    assert TidalService.day_bounding_box(day) == pytest.approx((53.5, 54.7, -5.0, -3.8))


def test_day_bounding_box_falls_back_to_the_uk_coast_without_points():
    assert TidalService.day_bounding_box(types.SimpleNamespace(points=[])) == (49.0, 60.0, -8.0, 2.0)


def test_land_mask_has_one_cell_per_grid_cell_and_is_all_sea_in_the_open_atlantic():
    mask = TidalService.velocity_land_mask(OPEN_ATLANTIC_BOX)

    assert len(mask) == CELLS
    assert not any(mask)


def test_land_mask_marks_land_cells_where_the_box_takes_in_land():
    mask = TidalService.velocity_land_mask((53.5, 54.7, -5.2, -3.8))

    assert any(mask)
    assert not all(mask)


# ── the pull ────────────────────────────────────────────────────────────────

@pytest.fixture
def day_with_conditions(app, user_1):
    """A day with two coastal points, wind at 06:00 and 12:00, and waves at 06:00 and 12:00."""
    with app.app_context():
        trip = Trip()
        db.session.add(trip)
        db.session.flush()
        db.session.add(TripMember(trip_id=trip.id, user_id=user_1.id, role=MemberRoleType.LEADER))
        itinerary = Itinerary(trip_id=trip.id, user_id=user_1.id)
        db.session.add(itinerary)
        db.session.flush()
        day = Day(day_number=1, itinerary_id=itinerary.id)
        db.session.add(day)
        db.session.flush()

        for latitude, longitude in ISLE_OF_MAN_POINTS:
            db.session.add(Point(day_id=day.id, latitude=latitude, longitude=longitude, type=PointType.STOP))

        db.session.add(Weather(day_id=day.id, model="open-meteo"))
        db.session.flush()
        db.session.add(WeatherState(day_id=day.id, time=time(6, 0), wind_force=18.0, wind_direction=90.0))
        db.session.add(WeatherState(day_id=day.id, time=time(12, 0), wind_force=36.0, wind_direction=270.0))

        db.session.add(Sea(day_id=day.id))
        db.session.flush()
        db.session.add(SeaState(day_id=day.id, time=time(6, 0), wave_height=0.8, wave_direction=45.0))
        db.session.add(SeaState(day_id=day.id, time=time(12, 0), wave_height=2.0, wave_direction=200.0))
        db.session.commit()

        ids = {"trip_id": str(trip.id), "day_id": str(day.id), "itinerary_id": itinerary.id, "raw_day_id": day.id}

    yield ids

    with app.app_context():
        raw_day_id = ids["raw_day_id"]
        db.session.query(Point).filter_by(day_id=raw_day_id).delete()
        db.session.query(WeatherState).filter_by(day_id=raw_day_id).delete()
        db.session.query(SeaState).filter_by(day_id=raw_day_id).delete()
        db.session.query(Weather).filter_by(day_id=raw_day_id).delete()
        db.session.query(Sea).filter_by(day_id=raw_day_id).delete()
        db.session.query(Day).filter_by(id=raw_day_id).delete()
        db.session.query(Itinerary).filter_by(id=ids["itinerary_id"]).delete()
        db.session.query(TripMember).filter_by(trip_id=UUID(ids["trip_id"])).delete()
        db.session.query(Trip).filter_by(id=UUID(ids["trip_id"])).delete()
        db.session.commit()


def _velocity(client, headers, trip_id, last_pulled_at=None):
    changes = _pull(client, headers, trip_id, last_pulled_at).json["changes"]
    return changes["velocity_days"], changes["velocity_hours"]


def test_pull_describes_the_days_grid_geometry_and_land_mask(client, auth_headers, day_with_conditions):
    days, _ = _velocity(client, auth_headers, day_with_conditions["trip_id"])

    [row] = days["created"]
    lat_min, lat_max, lon_min, lon_max = TidalService.day_bounding_box(
        types.SimpleNamespace(
            points=[types.SimpleNamespace(latitude=lat, longitude=lon) for lat, lon in ISLE_OF_MAN_POINTS]
        )
    )
    assert row["id"] == row["dayId"] == day_with_conditions["day_id"]
    assert (row["south"], row["north"], row["west"], row["east"]) == pytest.approx((lat_min, lat_max, lon_min, lon_max))
    assert row["size"] == VELOCITY_GRID_RESOLUTION
    assert len(row["landMask"]) == CELLS
    assert set(row["landMask"]) == {"0", "1"}
    assert days["deleted"] == []


def test_pull_gives_every_hour_of_the_day_its_wind_and_wave_flow(client, auth_headers, day_with_conditions):
    _, hours = _velocity(client, auth_headers, day_with_conditions["trip_id"])

    rows = hours["created"]
    assert [row["hour"] for row in rows] == list(range(24))
    day_id = day_with_conditions["day_id"]
    assert all(row["id"] == f"{day_id}:{row['hour']}" and row["dayId"] == day_id for row in rows)

    twelve = next(row for row in rows if row["hour"] == 12)
    assert (twelve["windU"], twelve["windV"]) == pytest.approx((-10.0, 0.0), abs=1e-4)
    assert twelve["waveU"] == pytest.approx(2.0 * -0.34202, abs=1e-4)
    assert twelve["waveV"] == pytest.approx(2.0 * -0.93969, abs=1e-4)


def test_an_hour_with_no_data_is_null_and_not_left_out(client, app, auth_headers, day_with_conditions):
    """Every hour is always sent, so a stale hour on the phone is overwritten rather than kept."""
    with app.app_context():
        db.session.query(WeatherState).filter_by(day_id=day_with_conditions["raw_day_id"]).delete()
        db.session.commit()

    _, hours = _velocity(client, auth_headers, day_with_conditions["trip_id"])

    assert len(hours["created"]) == 24
    assert all(row["windU"] is None and row["windV"] is None for row in hours["created"])
    assert all(row["waveU"] is not None for row in hours["created"])


def test_a_day_with_neither_weather_nor_sea_has_no_rows(client, app, auth_headers, day_with_conditions):
    with app.app_context():
        raw_day_id = day_with_conditions["raw_day_id"]
        db.session.query(WeatherState).filter_by(day_id=raw_day_id).delete()
        db.session.query(SeaState).filter_by(day_id=raw_day_id).delete()
        db.session.query(Weather).filter_by(day_id=raw_day_id).delete()
        db.session.query(Sea).filter_by(day_id=raw_day_id).delete()
        db.session.commit()

    days, hours = _velocity(client, auth_headers, day_with_conditions["trip_id"])

    assert days["created"] == []
    assert hours["created"] == []


def test_a_delta_pull_sends_the_rows_again_in_updated_whatever_the_cutoff(client, auth_headers, day_with_conditions):
    """The box comes from the route's points, which have no tombstones and no per-row delta, so
    the rows are not filtered by the cutoff: they are small, and applying one twice changes nothing."""
    far_future = 4_102_444_800_000

    days, hours = _velocity(client, auth_headers, day_with_conditions["trip_id"], far_future)

    assert days["created"] == [] and len(days["updated"]) == 1
    assert hours["created"] == [] and len(hours["updated"]) == 24


def test_a_moved_point_changes_the_box_on_the_next_pull(client, app, auth_headers, day_with_conditions):
    before, _ = _velocity(client, auth_headers, day_with_conditions["trip_id"])
    with app.app_context():
        point = db.session.query(Point).filter_by(day_id=day_with_conditions["raw_day_id"]).first()
        point.latitude = 55.5
        db.session.commit()

    after, _ = _velocity(client, auth_headers, day_with_conditions["trip_id"])

    assert after["created"][0]["north"] > before["created"][0]["north"]


# ── the contract: one source of truth ───────────────────────────────────────

def _expand(day_row, hour_row, kind):
    """What the phone does with a descriptor: stamp (u, v) over the grid, nulling land for waves."""
    u, v = hour_row[f"{kind}U"], hour_row[f"{kind}V"]
    if u is None or v is None:
        return None
    is_land = [character == "1" for character in day_row["landMask"]]
    masked = kind == "wave"
    eastward = [None if masked and land else u for land in is_land]
    northward = [None if masked and land else v for land in is_land]
    return eastward, northward


@pytest.mark.parametrize("hour", [0, 5, 6, 9, 12, 13, 23])
@pytest.mark.parametrize("kind,endpoint", [("wind", "wind-vectors"), ("wave", "wave-vectors")])
def test_the_descriptor_expands_to_what_the_endpoints_return(
    client, auth_headers, day_with_conditions, hour, kind, endpoint
):
    """The phone's grid must be the endpoint's grid. If this fails the two paths have drifted."""
    days, hours = _velocity(client, auth_headers, day_with_conditions["trip_id"])
    [day_row] = days["created"]
    hour_row = next(row for row in hours["created"] if row["hour"] == hour)
    day_id = day_with_conditions["day_id"]

    served = client.get(f"/api/v1/day/{day_id}/{endpoint}?hour={hour}", headers=auth_headers).get_json()
    eastward, northward = _expand(day_row, hour_row, kind)

    [east_layer, north_layer] = served["grid"]
    assert eastward == east_layer["data"]
    assert northward == north_layer["data"]
    header = east_layer["header"]
    assert (header["nx"], header["ny"]) == (day_row["size"], day_row["size"])
    assert (header["la1"], header["la2"], header["lo1"], header["lo2"]) == pytest.approx(
        (day_row["north"], day_row["south"], day_row["west"], day_row["east"])
    )


def test_membership_is_still_required(client, outsider_headers, day_with_conditions):
    assert _pull(client, outsider_headers, day_with_conditions["trip_id"]).status_code == 403
