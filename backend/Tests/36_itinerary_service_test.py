import io
import pytest
import gpxpy
from sqlalchemy.exc import NoResultFound
from uuid import UUID

from Api.database import db
from Models.day import Day
from Models.itinerary import Itinerary
from Models.point import Point, PointType
from Resources.itinerary_resource import ITINERARY_ENDPOINT
from Resources.point_resource import POINT_ENDPOINT
from Resources.trip_resource import TRIP_ENDPOINT
from Services.itinerary_service import ItineraryService

_FAKE_UUID = "00000000-0000-7000-8000-000000000099"


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture(scope="function")
def public_itinerary_with_points(client, auth_headers):
    """Public itinerary with 2 geo-positioned points (linked list) for fork/export tests."""
    trip_resp = client.post(f"{TRIP_ENDPOINT}/create", json={"inventory": {}}, headers=auth_headers)
    assert trip_resp.status_code == 201
    trip_id = trip_resp.json["id"]

    itin_resp = client.post(
        f"{ITINERARY_ENDPOINT}/create",
        json={"name": "Source Route", "tripId": trip_id},
        headers=auth_headers,
    )
    assert itin_resp.status_code == 201
    itin_data = itin_resp.json
    itin_id = itin_data["id"]
    day0_id = next(d["id"] for d in itin_data["days"] if d["dayNumber"] == 0)

    client.post(f"{POINT_ENDPOINT}/create", headers=auth_headers,
                json={"dayId": day0_id, "type": "stop", "name": "Camp Spot",
                      "latitude": 44.0, "longitude": 8.5, "notes": "secret"})
    client.post(f"{POINT_ENDPOINT}/create", headers=auth_headers,
                json={"dayId": day0_id, "type": "position",
                      "latitude": 44.1, "longitude": 8.6})

    patch = client.patch(f"{ITINERARY_ENDPOINT}/{itin_id}", headers=auth_headers,
                         json={"isPublic": True})
    assert patch.status_code == 200

    yield {"itinerary_id": itin_id, "trip_id": trip_id, "day0_id": day0_id}

    try:
        client.delete(f"{ITINERARY_ENDPOINT}/{itin_id}", headers=auth_headers)
    except Exception:
        pass
    try:
        client.delete(f"{TRIP_ENDPOINT}/{trip_id}", headers=auth_headers)
    except Exception:
        pass


@pytest.fixture(scope="function")
def itinerary_with_a_point(client, auth_headers):
    """Private itinerary with one positioned point, for apply_boundaries tests."""
    trip_resp = client.post(f"{TRIP_ENDPOINT}/create", json={"inventory": {}}, headers=auth_headers)
    assert trip_resp.status_code == 201
    trip_id = trip_resp.json["id"]

    itin_resp = client.post(
        f"{ITINERARY_ENDPOINT}/create",
        json={"name": "Boundaries Route", "tripId": trip_id},
        headers=auth_headers,
    )
    assert itin_resp.status_code == 201
    itin_data = itin_resp.json
    itin_id = itin_data["id"]
    day0_id = next(d["id"] for d in itin_data["days"] if d["dayNumber"] == 0)

    p1 = client.post(f"{POINT_ENDPOINT}/create", headers=auth_headers,
                     json={"dayId": day0_id, "type": "position",
                           "latitude": 44.0, "longitude": 8.5}).json

    yield {"itinerary_id": itin_id, "trip_id": trip_id,
           "point_id": p1["id"], "day0_id": day0_id}

    try:
        client.delete(f"{ITINERARY_ENDPOINT}/{itin_id}", headers=auth_headers)
    except Exception:
        pass
    try:
        client.delete(f"{TRIP_ENDPOINT}/{trip_id}", headers=auth_headers)
    except Exception:
        pass


# ── create_itinerary edge cases ───────────────────────────────────────────────

def test_create_standalone_requires_name(id):
    with pytest.raises(ValueError, match="name is required"):
        ItineraryService.create_itinerary({}, id)


def test_create_with_nonexistent_trip_raises(id):
    with pytest.raises(NoResultFound):
        ItineraryService.create_itinerary({"tripId": _FAKE_UUID}, id)


# ── fork_itinerary ────────────────────────────────────────────────────────────

def test_fork_public_itinerary(public_itinerary_with_points, id_2):
    """Fork creates a private deep copy (owned by a different user than the author),
    with new UUIDs, correct name, and intact linked list."""
    source_id = public_itinerary_with_points["itinerary_id"]
    fork = ItineraryService.fork_itinerary(source_id, id_2)
    try:
        forked_points = [p for day in fork.days for p in day.points]
        order = ItineraryService._walk_linked_list(forked_points)
        forked_ids = {str(p.id) for p in forked_points}

        assert fork.is_public is False
        assert fork.name == "Source Route"
        assert str(fork.user_id) == id_2
        assert len(forked_points) == 2
        assert len(order) == 2
        assert "Camp Spot" in {p.name for p in forked_points}
        assert PointType.STOP in {p.type for p in forked_points}
        assert source_id not in forked_ids
    finally:
        db.session.delete(fork)
        db.session.commit()


def test_fork_gets_a_staging_day_even_when_the_source_has_none(
    public_itinerary_with_points, id_2
):
    """A fork is a route the user is expected to edit, and every dropped point
    stages into Day 0 first. The deep copy reproduces the source exactly, so a
    source with no Day 0 used to hand back a fork that silently refused every new
    point and every day-boundary save."""
    source_id = public_itinerary_with_points["itinerary_id"]

    # Reproduce a hand-built itinerary (the demo seed, a pre-fix fork) that never ran
    # through ensure_staging_day: the route lives in numbered days and there is no
    # staging day at all. The points move first — Day.points cascades, so deleting
    # Day 0 out from under them would take the route with it.
    source_day0 = (
        db.session.query(Day)
        .filter_by(itinerary_id=UUID(source_id), day_number=0)
        .one()
    )
    day_one = Day(day_number=1, itinerary_id=UUID(source_id), date=None)
    db.session.add(day_one)
    db.session.flush()
    staged = db.session.query(Point).filter_by(day_id=source_day0.id).all()
    assert len(staged) == 2
    for point in staged:
        point.day_id = day_one.id
    db.session.flush()
    db.session.delete(source_day0)
    db.session.commit()

    fork = ItineraryService.fork_itinerary(source_id, id_2)
    try:
        day_zeros = (
            db.session.query(Day).filter_by(itinerary_id=fork.id, day_number=0).all()
        )
        assert len(day_zeros) == 1
        # The staging day is empty — it stages what the user drops next, and must
        # not have swallowed any of the copied route.
        assert not day_zeros[0].points
        assert len([p for day in fork.days for p in (day.points or [])]) == 2
    finally:
        db.session.delete(fork)
        db.session.commit()


def test_fork_does_not_duplicate_an_existing_staging_day(
    public_itinerary_with_points, id_2
):
    """ensure_staging_day runs after the day copy, so a source that already carries
    a Day 0 yields exactly one — not the copied row plus a freshly created one."""
    source_id = public_itinerary_with_points["itinerary_id"]
    assert (
        db.session.query(Day)
        .filter_by(itinerary_id=UUID(source_id), day_number=0)
        .count()
        == 1
    )

    fork = ItineraryService.fork_itinerary(source_id, id_2)
    try:
        assert (
            db.session.query(Day).filter_by(itinerary_id=fork.id, day_number=0).count()
            == 1
        )
    finally:
        db.session.delete(fork)
        db.session.commit()


def test_fork_private_itinerary_raises(itinerary_with_a_point, id):
    itin_id = itinerary_with_a_point["itinerary_id"]
    with pytest.raises(PermissionError, match="Only public itineraries can be forked"):
        ItineraryService.fork_itinerary(itin_id, id)


def test_fork_own_itinerary_raises(public_itinerary_with_points, id):
    """Authors cannot fork their own public route — it would duplicate it in their list."""
    source_id = public_itinerary_with_points["itinerary_id"]
    with pytest.raises(PermissionError, match="already own"):
        ItineraryService.fork_itinerary(source_id, id)


# ── apply_boundaries error branches ──────────────────────────────────────────

def test_apply_boundaries_point_not_in_list_raises(itinerary):
    """Boundary referencing a UUID absent from the linked list raises ValueError."""
    day1_id = next(d["id"] for d in itinerary["days"] if d["dayNumber"] == 1)
    with pytest.raises(ValueError, match="Boundary point not found"):
        ItineraryService.apply_boundaries(
            itinerary["id"],
            boundaries=[{"dayId": day1_id, "startPointId": _FAKE_UUID,
                          "endPointId": _FAKE_UUID, "date": None}],
            point_updates=[],
        )


def test_apply_boundaries_day_not_in_itinerary_raises(itinerary_with_a_point):
    """Boundary referencing a day from another itinerary raises ValueError."""
    point_id = itinerary_with_a_point["point_id"]
    with pytest.raises(ValueError, match="does not belong to this itinerary"):
        ItineraryService.apply_boundaries(
            itinerary_with_a_point["itinerary_id"],
            boundaries=[{"dayId": _FAKE_UUID, "startPointId": point_id,
                          "endPointId": point_id, "date": None}],
            point_updates=[],
        )


def test_apply_boundaries_no_staging_day_raises(client, auth_headers):
    """Itinerary missing day 0 raises ValueError."""
    trip_resp = client.post(f"{TRIP_ENDPOINT}/create", json={"inventory": {}}, headers=auth_headers)
    trip_id = trip_resp.json["id"]
    itin_resp = client.post(f"{ITINERARY_ENDPOINT}/create",
                             json={"name": "Corrupt", "tripId": trip_id}, headers=auth_headers)
    itin_id = itin_resp.json["id"]

    day0 = db.session.query(Day).filter_by(itinerary_id=UUID(itin_id), day_number=0).first()
    db.session.delete(day0)
    db.session.commit()

    try:
        with pytest.raises(ValueError, match="no staging day"):
            ItineraryService.apply_boundaries(itin_id, boundaries=[], point_updates=[])
    finally:
        db.session.query(Itinerary).filter_by(id=UUID(itin_id)).delete()
        db.session.commit()


def test_apply_boundaries_point_updates_applied(itinerary_with_a_point):
    """point_updates renames and retypes points in the same transaction."""
    itin_id = itinerary_with_a_point["itinerary_id"]
    point_id = itinerary_with_a_point["point_id"]

    ItineraryService.apply_boundaries(
        itin_id,
        boundaries=[],
        point_updates=[{"id": point_id, "name": "Renamed", "type": "stop"}],
    )

    point = db.session.query(Point).filter_by(id=UUID(point_id)).first()
    assert point.name == "Renamed"
    assert point.type == PointType.STOP


def test_apply_boundaries_dates_land_on_their_own_day(client, auth_headers, itinerary):
    """Regression: each boundary's date must be written to that boundary's day.

    A leaked loop variable (`day` from the day-indexing loop instead of
    `boundary_day`) used to send every boundary date to one arbitrary day.
    """
    itin_id = itinerary["id"]
    day0_id = next(d["id"] for d in itinerary["days"] if d["dayNumber"] == 0)
    day1_id = next(d["id"] for d in itinerary["days"] if d["dayNumber"] == 1)
    day2_id = next(d["id"] for d in itinerary["days"] if d["dayNumber"] == 2)

    point_ids = []
    for offset in range(4):
        response = client.post(
            f"{POINT_ENDPOINT}/create", headers=auth_headers,
            json={"dayId": day0_id, "type": "position",
                  "latitude": 44.0 + offset * 0.1, "longitude": 8.5},
        )
        assert response.status_code == 201
        point_ids.append(response.json["id"])

    ItineraryService.apply_boundaries(
        itin_id,
        boundaries=[
            {"dayId": day1_id, "startPointId": point_ids[0],
             "endPointId": point_ids[1], "date": "2026-08-10"},
            {"dayId": day2_id, "startPointId": point_ids[2],
             "endPointId": point_ids[3], "date": "2026-08-11"},
        ],
        point_updates=[],
    )

    day1 = db.session.query(Day).filter_by(id=UUID(day1_id)).one()
    day2 = db.session.query(Day).filter_by(id=UUID(day2_id)).one()
    assert day1.date.isoformat() == "2026-08-10"
    assert day2.date.isoformat() == "2026-08-11"


# ── export_gpx ────────────────────────────────────────────────────────────────

def test_export_gpx_returns_valid_gpx_with_correct_point_count(public_itinerary_with_points):
    itin_id = public_itinerary_with_points["itinerary_id"]
    gpx_bytes = ItineraryService.export_gpx(itin_id, include_private=True)
    assert isinstance(gpx_bytes, bytes)
    parsed = gpxpy.parse(io.BytesIO(gpx_bytes))
    total = sum(len(r.points) for r in parsed.routes)
    assert total == 2


def test_export_gpx_skips_points_without_coordinates(client, auth_headers):
    """Points with no lat/lng are excluded from GPX output."""
    trip_resp = client.post(f"{TRIP_ENDPOINT}/create", json={"inventory": {}}, headers=auth_headers)
    trip_id = trip_resp.json["id"]
    itin_resp = client.post(f"{ITINERARY_ENDPOINT}/create",
                             json={"name": "Sparse", "tripId": trip_id}, headers=auth_headers)
    itin_id = itin_resp.json["id"]
    day0_id = next(d["id"] for d in itin_resp.json["days"] if d["dayNumber"] == 0)

    client.post(f"{POINT_ENDPOINT}/create", headers=auth_headers,
                json={"dayId": day0_id, "type": "stop", "latitude": 44.0, "longitude": 8.5})
    client.post(f"{POINT_ENDPOINT}/create", headers=auth_headers,
                json={"dayId": day0_id, "type": "stop"})  # no coordinates

    gpx_bytes = ItineraryService.export_gpx(itin_id, include_private=True)
    parsed = gpxpy.parse(io.BytesIO(gpx_bytes))
    assert sum(len(r.points) for r in parsed.routes) == 1

    client.delete(f"{ITINERARY_ENDPOINT}/{itin_id}", headers=auth_headers)
    client.delete(f"{TRIP_ENDPOINT}/{trip_id}", headers=auth_headers)


def test_export_gpx_include_private_controls_notes(public_itinerary_with_points):
    itin_id = public_itinerary_with_points["itinerary_id"]
    assert b"secret" not in ItineraryService.export_gpx(itin_id, include_private=False)
    assert b"secret" in ItineraryService.export_gpx(itin_id, include_private=True)


# ── import_gpx ────────────────────────────────────────────────────────────────

_ROUTE_GPX = b"""<?xml version="1.0"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>My Route</name></metadata>
  <rte>
    <rtept lat="44.0" lon="8.5"><name>Start</name></rtept>
    <rtept lat="44.1" lon="8.6"><name>Mid</name></rtept>
    <rtept lat="44.2" lon="8.7"><name>End</name></rtept>
  </rte>
</gpx>"""

_TRACK_GPX = b"""<?xml version="1.0"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
  <trk><trkseg>
    <trkpt lat="44.0" lon="8.5"/>
    <trkpt lat="44.0" lon="8.5"/>
    <trkpt lat="44.0" lon="8.5"/>
    <trkpt lat="44.2" lon="8.7"/>
  </trkseg></trk>
</gpx>"""

_EMPTY_GPX = b"""<?xml version="1.0"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
  <rte></rte>
</gpx>"""


def test_import_gpx_from_route_creates_itinerary_with_linked_points(id):
    itinerary = ItineraryService.import_gpx(_ROUTE_GPX, "route.gpx", id)
    try:
        all_points = [p for day in itinerary.days for p in day.points]
        order = ItineraryService._walk_linked_list(all_points)
        assert len(all_points) == 3
        assert len(order) == 3
        assert any(d.day_number == 0 for d in itinerary.days)
    finally:
        db.session.delete(itinerary)
        db.session.commit()


def test_import_gpx_from_track_uses_rdp(id):
    """Track import goes through the RDP simplification path."""
    itinerary = ItineraryService.import_gpx(_TRACK_GPX, "track.gpx", id)
    try:
        all_points = [p for day in itinerary.days for p in day.points]
        assert len(all_points) >= 1
    finally:
        db.session.delete(itinerary)
        db.session.commit()


def test_import_gpx_file_too_large_raises(id):
    with pytest.raises(ValueError, match="5 MB limit"):
        ItineraryService.import_gpx(b"x" * (5 * 1024 * 1024 + 1), "big.gpx", id)


def test_import_gpx_invalid_bytes_raises(id):
    with pytest.raises(ValueError, match="Invalid GPX file"):
        ItineraryService.import_gpx(b"not gpx at all", "bad.gpx", id)


def test_import_gpx_no_routes_or_tracks_raises(id):
    with pytest.raises(ValueError, match="no routes or tracks"):
        ItineraryService.import_gpx(_EMPTY_GPX, "empty.gpx", id)


def test_import_gpx_name_from_gpx_tag(id):
    itinerary = ItineraryService.import_gpx(_ROUTE_GPX, "fallback.gpx", id)
    try:
        assert itinerary.name == "My Route"
    finally:
        db.session.delete(itinerary)
        db.session.commit()


def test_import_gpx_name_falls_back_to_filename(id):
    gpx_no_name = b"""<?xml version="1.0"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
  <rte><rtept lat="44.0" lon="8.5"/></rte>
</gpx>"""
    itinerary = ItineraryService.import_gpx(gpx_no_name, "my_trip.gpx", id)
    try:
        assert itinerary.name == "my_trip"
    finally:
        db.session.delete(itinerary)
        db.session.commit()


def test_import_gpx_name_sanitised(id):
    xss_gpx = b"""<?xml version="1.0"?>
<gpx version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>&lt;script&gt;alert(1)&lt;/script&gt;</name></metadata>
  <rte><rtept lat="44.0" lon="8.5"/></rte>
</gpx>"""
    itinerary = ItineraryService.import_gpx(xss_gpx, "xss.gpx", id)
    try:
        assert "<script>" not in itinerary.name
    finally:
        db.session.delete(itinerary)
        db.session.commit()
