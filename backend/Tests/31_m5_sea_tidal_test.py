"""§0 model round-trip tests — M5 sea/tidal additions."""
import uuid as _uuid

import pytest
from datetime import time
from decimal import Decimal

from geoalchemy2.shape import from_shape
from shapely.geometry import Point as ShapelyPoint

from Api.database import db as _db
from Models.day import Day
from Models.itinerary import Itinerary
from Models.sea import Sea
from Models.sea_state import SeaState
from Models.tidal_station import StreamEntryMode, TidalStation
from Models.tidal_stream_entry import TidalStreamEntry
from Models.user import User
from Services.tidal_station_service import TidalStationService


# ── Sea.tidal_range_m ─────────────────────────────────────────────────────────

def test_sea_tidal_range_m_nullable_by_default(app, itinerary):
    """New Sea row has tidal_range_m=None by default."""
    day_id = itinerary["days"][0]["id"]
    sea = Sea(day_id=day_id)
    _db.session.add(sea)
    _db.session.commit()

    loaded = _db.session.query(Sea).filter_by(day_id=day_id).first()
    assert loaded.tidal_range_m is None

    _db.session.delete(loaded)
    _db.session.commit()


def test_sea_tidal_range_m_round_trips(app, itinerary):
    """Sea.tidal_range_m persists and can be read back as a numeric value."""
    day_id = itinerary["days"][0]["id"]
    sea = Sea(day_id=day_id, tidal_range_m=Decimal("3.80"))
    _db.session.add(sea)
    _db.session.commit()

    _db.session.expire(sea)
    loaded = _db.session.query(Sea).filter_by(day_id=day_id).first()
    assert float(loaded.tidal_range_m) == pytest.approx(3.80)

    _db.session.delete(loaded)
    _db.session.commit()


# ── SeaState current fields ───────────────────────────────────────────────────

def test_sea_state_current_columns_round_trip(app, itinerary):
    """SeaState.current_speed and current_direction persist correctly."""
    day_id = itinerary["days"][0]["id"]

    sea = Sea(day_id=day_id)
    _db.session.add(sea)
    _db.session.flush()

    state = SeaState(
        day_id=day_id,
        time=time(12, 0),
        current_speed=Decimal("1.50"),
        current_direction=Decimal("270"),
    )
    _db.session.add(state)
    _db.session.commit()

    loaded = _db.session.query(SeaState).filter_by(day_id=day_id, time=time(12, 0)).first()
    assert float(loaded.current_speed) == pytest.approx(1.50)
    assert float(loaded.current_direction) == pytest.approx(270.0)

    _db.session.delete(loaded)
    _db.session.delete(sea)
    _db.session.commit()


def test_sea_state_current_columns_nullable(app, itinerary):
    """SeaState rows without current data have current_speed/direction=None."""
    day_id = itinerary["days"][0]["id"]

    sea = Sea(day_id=day_id)
    _db.session.add(sea)
    _db.session.flush()

    state = SeaState(day_id=day_id, time=time(9, 0))
    _db.session.add(state)
    _db.session.commit()

    loaded = _db.session.query(SeaState).filter_by(day_id=day_id, time=time(9, 0)).first()
    assert loaded.current_speed is None
    assert loaded.current_direction is None

    _db.session.delete(loaded)
    _db.session.delete(sea)
    _db.session.commit()


# ── TidalStation ─────────────────────────────────────────────────────────────

def test_tidal_station_round_trip(app):
    """TidalStation persists with PostGIS geometry and all fields."""
    location = from_shape(ShapelyPoint(-5.0, 50.0), srid=4326)
    station = TidalStation(
        name="Dodman Point",
        location=location,
        source="UKHO Chart 5011",
        notes="Tidal race south of headland",
        mean_spring_range_m=Decimal("4.20"),
    )
    _db.session.add(station)
    _db.session.commit()

    loaded = _db.session.query(TidalStation).filter_by(name="Dodman Point").first()
    assert loaded is not None
    assert loaded.source == "UKHO Chart 5011"
    assert loaded.notes == "Tidal race south of headland"
    assert float(loaded.mean_spring_range_m) == pytest.approx(4.20)

    _db.session.delete(loaded)
    _db.session.commit()


def test_tidal_station_optional_fields_nullable(app):
    """TidalStation can be created with only required fields (name + location)."""
    location = from_shape(ShapelyPoint(-4.5, 49.9), srid=4326)
    station = TidalStation(name="Minimal Station", location=location)
    _db.session.add(station)
    _db.session.commit()

    loaded = _db.session.query(TidalStation).filter_by(name="Minimal Station").first()
    assert loaded.source is None
    assert loaded.notes is None
    assert loaded.mean_spring_range_m is None

    _db.session.delete(loaded)
    _db.session.commit()


# ── TidalStreamEntry ──────────────────────────────────────────────────────────

def test_tidal_stream_entry_composite_pk(app):
    """TidalStreamEntry stores multiple hours per station with composite PK."""
    location = from_shape(ShapelyPoint(-5.2, 50.2), srid=4326)
    station = TidalStation(name="Stream Entry Test", location=location)
    _db.session.add(station)
    _db.session.flush()

    for h in range(-6, 7):
        entry = TidalStreamEntry(
            station_id=station.id,
            hours_from_hw=h,
            direction_degrees=Decimal("270"),
            spring_rate_knots=Decimal("2.10"),
            neap_rate_knots=Decimal("1.00"),
        )
        _db.session.add(entry)

    _db.session.commit()

    entries = _db.session.query(TidalStreamEntry).filter_by(station_id=station.id).all()
    assert len(entries) == 13
    hours = sorted(e.hours_from_hw for e in entries)
    assert hours == list(range(-6, 7))

    station_id = station.id
    _db.session.delete(station)
    _db.session.commit()

    # ondelete="CASCADE" on TidalStreamEntry.station_id — deleting the station
    # must not leave the 13 hourly rows orphaned.
    assert _db.session.query(TidalStreamEntry).filter_by(station_id=station_id).all() == []


def test_tidal_stream_entry_optional_rate_fields(app):
    """TidalStreamEntry spring_rate_knots and neap_rate_knots are nullable."""
    location = from_shape(ShapelyPoint(-5.3, 50.3), srid=4326)
    station = TidalStation(name="Nullable Rate Station", location=location)
    _db.session.add(station)
    _db.session.flush()

    entry = TidalStreamEntry(
        station_id=station.id,
        hours_from_hw=0,
        direction_degrees=Decimal("180"),
    )
    _db.session.add(entry)
    _db.session.commit()

    loaded = _db.session.query(TidalStreamEntry).filter_by(
        station_id=station.id, hours_from_hw=0
    ).first()
    assert loaded.spring_rate_knots is None
    assert loaded.neap_rate_knots is None

    _db.session.delete(station)
    _db.session.commit()


# ── Sea tidal operability fields ──────────────────────────────────────────────

def test_sea_tidal_operability_fields_round_trip(app, itinerary):
    """All 10 tidal operability fields persist and are read back correctly."""
    day_id = itinerary["days"][0]["id"]
    sea = Sea(
        day_id=day_id,
        reference_port_name="Milford Haven",
        hw_time_offset_minutes=35,
        lw_time_offset_minutes=30,
        hw_height_ratio=0.95,
        lw_height_ratio=1.05,
        tidal_source="manual_corrected",
        flood_direction_degrees=47.0,
        ebb_direction_degrees=227.0,
        max_spring_rate_knots=3.1,
        max_neap_rate_knots=1.6,
    )
    _db.session.add(sea)
    _db.session.commit()

    _db.session.expire(sea)
    loaded = _db.session.query(Sea).filter_by(day_id=day_id).first()
    assert loaded.reference_port_name == "Milford Haven"
    assert loaded.hw_time_offset_minutes == 35
    assert loaded.lw_time_offset_minutes == 30
    assert float(loaded.hw_height_ratio) == pytest.approx(0.95)
    assert float(loaded.lw_height_ratio) == pytest.approx(1.05)
    assert loaded.tidal_source == "manual_corrected"
    assert float(loaded.flood_direction_degrees) == pytest.approx(47.0)
    assert float(loaded.ebb_direction_degrees) == pytest.approx(227.0)
    assert float(loaded.max_spring_rate_knots) == pytest.approx(3.1)
    assert float(loaded.max_neap_rate_knots) == pytest.approx(1.6)

    _db.session.delete(loaded)
    _db.session.commit()


def test_sea_tidal_source_defaults_to_manual(app, itinerary):
    """Sea.tidal_source defaults to 'manual' when not set."""
    day_id = itinerary["days"][1]["id"]
    sea = Sea(day_id=day_id)
    _db.session.add(sea)
    _db.session.commit()

    _db.session.expire(sea)
    loaded = _db.session.query(Sea).filter_by(day_id=day_id).first()
    assert loaded.tidal_source == "manual"

    _db.session.delete(loaded)
    _db.session.commit()


def test_sea_tidal_operability_fields_all_nullable(app, itinerary):
    """All optional tidal operability fields are nullable by default."""
    day_id = itinerary["days"][0]["id"]
    sea = Sea(day_id=day_id)
    _db.session.add(sea)
    _db.session.commit()

    _db.session.expire(sea)
    loaded = _db.session.query(Sea).filter_by(day_id=day_id).first()
    assert loaded.reference_port_name is None
    assert loaded.hw_time_offset_minutes is None
    assert loaded.lw_time_offset_minutes is None
    assert loaded.hw_height_ratio is None
    assert loaded.lw_height_ratio is None
    assert loaded.flood_direction_degrees is None
    assert loaded.ebb_direction_degrees is None
    assert loaded.max_spring_rate_knots is None
    assert loaded.max_neap_rate_knots is None


# ── Cascade / constraint behaviour (rubric #4) ────────────────────────────────
# Deletion fate down the day → sea → sea_state chain, the tidal-diamond
# itinerary scoping, and the diamond-creator FK, exercised explicitly rather
# than assumed from the ondelete= declarations in the model files.

def test_deleting_day_cascades_to_sea_and_sea_state(app, itinerary):
    """Day.id → Sea.day_id → SeaState.day_id are both ondelete=CASCADE: deleting
    the Day must not leave either child table's rows behind."""
    day_id = itinerary["days"][0]["id"]
    sea = Sea(day_id=day_id, high_tide=time(12, 0), low_tide=time(6, 0), tidal_range_m=Decimal("4.0"))
    _db.session.add(sea)
    _db.session.flush()
    state = SeaState(day_id=day_id, time=time(9, 0), wave_height=Decimal("1.2"))
    _db.session.add(state)
    _db.session.commit()

    day = _db.session.get(Day, day_id)
    _db.session.delete(day)
    _db.session.commit()

    assert _db.session.query(Sea).filter_by(day_id=day_id).first() is None
    assert _db.session.query(SeaState).filter_by(day_id=day_id).first() is None


def test_deleting_itinerary_cascades_to_user_created_diamond(app, itinerary, id):
    """TidalStation.itinerary_id is ondelete=CASCADE: deleting an itinerary must
    take its user-created diamonds (and their stream entries) with it — a
    diamond scoped to a deleted itinerary would otherwise be an orphaned,
    unreachable row (no resource route can look it up without an itinerary)."""
    station = TidalStationService.create_user_diamond(itinerary["id"], id, {
        "name": "Doomed Diamond", "location": from_shape(ShapelyPoint(-4.3, 50.2), srid=4326),
        "entry_mode": StreamEntryMode.SIMPLE, "max_spring_rate_knots": 2.0,
        "flood_direction_degrees": 90, "ebb_direction_degrees": 270,
    })
    station_id = station.id

    itin = _db.session.get(Itinerary, itinerary["id"])
    _db.session.delete(itin)
    _db.session.commit()

    assert _db.session.query(TidalStation).filter_by(id=station_id).first() is None
    assert _db.session.query(TidalStreamEntry).filter_by(station_id=station_id).all() == []


def test_deleting_diamond_creator_nulls_created_by_not_the_diamond(app, client, itinerary):
    """TidalStation.created_by_user_id is ondelete=SET NULL (not CASCADE): the
    diamond itself is itinerary-scoped, so deleting the crew member who placed
    it must not delete a station other crew still rely on for route planning —
    only the attribution should go."""
    suffix = _uuid.uuid4().hex[:8]
    mail = f"throwaway.{suffix}@example.com"
    resp = client.post("/api/v1/auth/register", json={
        "mail": mail, "pwd": "ThrowAway9$",
        "phone": f"+39{_uuid.uuid4().int % 10**10:010d}",
        "name": "Throwaway", "username": f"throwaway_{suffix}",
    })
    assert resp.status_code == 201
    creator = _db.session.query(User).filter_by(mail=mail).first()
    creator_id = creator.id

    station = TidalStationService.create_user_diamond(itinerary["id"], str(creator_id), {
        "name": "Orphaned-Creator Diamond", "location": from_shape(ShapelyPoint(-4.4, 50.1), srid=4326),
        "entry_mode": StreamEntryMode.SIMPLE, "max_spring_rate_knots": 2.0,
        "flood_direction_degrees": 90, "ebb_direction_degrees": 270,
    })
    station_id = station.id

    _db.session.delete(creator)
    _db.session.commit()

    reloaded = _db.session.query(TidalStation).filter_by(id=station_id).first()
    assert reloaded is not None
    assert reloaded.created_by_user_id is None

    _db.session.delete(reloaded)
    _db.session.commit()
