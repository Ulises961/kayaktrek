"""§6 acceptance — a user-created tidal diamond raises a tidal-gate warning
through the existing ST_DWithin proximity logic, with no special-casing for
user diamonds (they are ordinary TidalStation rows scoped to an itinerary).

Two levels:
  * service — create_user_diamond + tidal_gates_for_day directly.
  * e2e — drive it through the real HTTP endpoints: POST the diamond, then GET
    the day's tidal gates and assert it shows up as a blocking warning.
"""
from datetime import time
from decimal import Decimal
from uuid import UUID

from geoalchemy2.shape import from_shape
from shapely.geometry import Point as ShapelyPoint

from Api.database import db as _db
from Models.day import Day
from Models.point import Point, PointType
from Models.sea import Sea
from Models.tidal_station import StreamEntryMode
from Services.tidal_service import TidalService
from Services.tidal_station_service import TidalStationService

# Diamond sits on top of the route point; 09:00 default start, 0 nm cumulative →
# transit 09:00, HW 06:00 → hours_from_hw = +3 → rule-of-thirds peak (3.0 kn > 2.0 → blocking).
_LAT, _LON = 50.3, -4.1


def _seed_route_point_and_sea(itinerary):
    day = _db.session.get(Day, UUID(itinerary["days"][0]["id"]))
    point = Point(
        latitude=_LAT, longitude=_LON,
        geo=from_shape(ShapelyPoint(_LON, _LAT), srid=4326),
        type=PointType.STOP, day_id=day.id,
    )
    sea = Sea(day_id=day.id, high_tide=time(6, 0), low_tide=time(12, 0), tidal_range_m=Decimal("4.0"))
    _db.session.add_all([point, sea])
    _db.session.commit()
    return day, point, sea


def test_user_diamond_raises_gate_warning_service(app, itinerary, id):
    day, point, sea = _seed_route_point_and_sea(itinerary)

    TidalStationService.create_user_diamond(itinerary["id"], id, {
        "name": "The Race", "location": from_shape(ShapelyPoint(_LON, _LAT), srid=4326),
        "entry_mode": StreamEntryMode.SIMPLE, "max_spring_rate_knots": 3.0,
        "flood_direction_degrees": 45, "ebb_direction_degrees": 225, "radius_m": 500,
    })

    gates = TidalService.tidal_gates_for_day(day, [point], sea)
    race = next((g for g in gates if g["station_name"] == "The Race"), None)
    assert race is not None
    assert race["is_blocking"] is True


def test_user_diamond_surfaces_in_tidal_gates_endpoint_e2e(client, auth_headers, itinerary):
    day, _point, _sea = _seed_route_point_and_sea(itinerary)

    create = client.post("/api/tidal-diamond/create", headers=auth_headers, json={
        "itineraryId": itinerary["id"],
        "name": "The Race",
        "location": {"type": "Point", "coordinates": [_LON, _LAT]},
        "entryMode": "simple",
        "maxSpringRateKnots": 3.0,
        "floodDirectionDegrees": 45,
        "ebbDirectionDegrees": 225,
        "radiusM": 500,
    })
    assert create.status_code == 201

    resp = client.get(f"/api/day/{day.id}/tidal-gates", headers=auth_headers)
    assert resp.status_code == 200
    gates = resp.get_json()
    race = next((g for g in gates if g["stationName"] == "The Race"), None)
    assert race is not None
    assert race["isBlocking"] is True
