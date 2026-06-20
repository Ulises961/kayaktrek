"""M4d tidal diamond service tests — §1 rule-of-thirds synthesis and
trip-scoped user-diamond CRUD (create / patch / rebuild); §2 day-diamond
resolution at a clock hour."""
from datetime import time

import pytest
from geoalchemy2.shape import from_shape
from shapely.geometry import Point as ShapelyPoint

from Api.database import db
from Models.day import Day
from Models.sea import Sea
from Models.tidal_station import StreamEntryMode
from Models.tidal_stream_entry import TidalStreamEntry
from Services.tidal_service import TidalService
from Services.tidal_station_service import TidalStationService


def _loc(lng=-4.1, lat=50.3):
    return from_shape(ShapelyPoint(lng, lat), srid=4326)


# ── synthesise_stream_entries (rule of thirds) ───────────────────────────────

def test_synthesis_returns_13_entries_spanning_minus6_to_plus6(app):
    entries = TidalService.synthesise_stream_entries(3.0, 45, 225)
    assert len(entries) == 13
    assert [e.hours_from_hw for e in entries] == list(range(-6, 7))


def test_synthesis_assigns_flood_and_ebb_directions_by_phase(app):
    entries = {e.hours_from_hw: e for e in TidalService.synthesise_stream_entries(3.0, 45, 225)}
    # LW→HW half (and the LW boundary at +6) floods; HW→LW half ebbs.
    for h in (-6, -5, -4, -3, -2, -1, 6):
        assert entries[h].direction_degrees == 45
    for h in (0, 1, 2, 3, 4, 5):
        assert entries[h].direction_degrees == 225


def test_synthesis_peaks_at_mid_tide_and_slacks_at_turns(app):
    entries = {e.hours_from_hw: e for e in TidalService.synthesise_stream_entries(3.0, 45, 225)}
    # Peak (3/3) at mid-flood / mid-ebb.
    assert entries[-3].spring_rate_knots == pytest.approx(3.0)
    assert entries[3].spring_rate_knots == pytest.approx(3.0)
    # Slack (zero rate) at the HW and LW turns.
    assert entries[0].spring_rate_knots == pytest.approx(0.0)
    assert entries[-6].spring_rate_knots == pytest.approx(0.0)
    assert entries[6].spring_rate_knots == pytest.approx(0.0)
    # Thirds building between slack and peak.
    assert entries[-5].spring_rate_knots == pytest.approx(1.0)
    assert entries[-4].spring_rate_knots == pytest.approx(2.0)


def test_synthesis_neap_defaults_to_spring_when_omitted(app):
    entries = TidalService.synthesise_stream_entries(3.0, 45, 225)
    for e in entries:
        assert e.neap_rate_knots == pytest.approx(e.spring_rate_knots)


def test_synthesis_neap_scales_independently_when_provided(app):
    entries = {e.hours_from_hw: e for e in
               TidalService.synthesise_stream_entries(3.0, 45, 225, max_neap_rate_knots=1.5)}
    assert entries[-3].neap_rate_knots == pytest.approx(1.5)  # peak neap
    assert entries[0].neap_rate_knots == pytest.approx(0.0)   # slack at HW


# ── create_user_diamond ──────────────────────────────────────────────────────

def test_create_simple_diamond_persists_13_synthesised_entries(app, itinerary, id):
    data = {
        "name": "Race", "location": _loc(), "entry_mode": StreamEntryMode.SIMPLE,
        "max_spring_rate_knots": 3.0, "flood_direction_degrees": 45,
        "ebb_direction_degrees": 225, "radius_m": 500,
    }
    station = TidalStationService.create_user_diamond(itinerary["id"], id, data)
    assert str(station.itinerary_id) == itinerary["id"]
    assert str(station.created_by_user_id) == id
    assert station.entry_mode == StreamEntryMode.SIMPLE
    assert station.is_user_created is True
    assert len(station.tidal_stream_entries) == 13


def test_create_advanced_diamond_stores_supplied_table_verbatim(app, itinerary, id):
    rows = [TidalStreamEntry(hours_from_hw=h, direction_degrees=90,
                             spring_rate_knots=2.0, neap_rate_knots=1.0) for h in range(-6, 7)]
    data = {
        "name": "Atlas pt", "location": _loc(), "entry_mode": StreamEntryMode.ATLAS,
        "tidal_stream_entries": rows,
    }
    station = TidalStationService.create_user_diamond(itinerary["id"], id, data)
    assert station.entry_mode == StreamEntryMode.ATLAS
    assert {e.direction_degrees for e in station.tidal_stream_entries} == {90}


def test_create_simple_diamond_missing_peak_fields_raises(app, itinerary, id):
    data = {"name": "Bad", "location": _loc(), "entry_mode": StreamEntryMode.SIMPLE,
            "flood_direction_degrees": 45, "ebb_direction_degrees": 225}
    with pytest.raises(ValueError):
        TidalStationService.create_user_diamond(itinerary["id"], id, data)


# ── update_user_diamond ──────────────────────────────────────────────────────

def test_update_diamond_field_only_does_not_rebuild_entries(app, itinerary, id):
    data = {"name": "Race", "location": _loc(), "entry_mode": StreamEntryMode.SIMPLE,
            "max_spring_rate_knots": 3.0, "flood_direction_degrees": 45, "ebb_direction_degrees": 225}
    station = TidalStationService.create_user_diamond(itinerary["id"], id, data)
    entry_ids_before = {(e.station_id, e.hours_from_hw) for e in station.tidal_stream_entries}

    updated = TidalStationService.update_user_diamond(str(station.id), {"notes": "spring ebb sets E"})
    assert updated.notes == "spring ebb sets E"
    assert {(e.station_id, e.hours_from_hw) for e in updated.tidal_stream_entries} == entry_ids_before


def test_update_diamond_rate_change_resynthesises_entries(app, itinerary, id):
    data = {"name": "Race", "location": _loc(), "entry_mode": StreamEntryMode.SIMPLE,
            "max_spring_rate_knots": 3.0, "flood_direction_degrees": 45, "ebb_direction_degrees": 225}
    station = TidalStationService.create_user_diamond(itinerary["id"], id, data)

    updated = TidalStationService.update_user_diamond(str(station.id), {
        "max_spring_rate_knots": 6.0, "flood_direction_degrees": 45, "ebb_direction_degrees": 225,
    })
    peak = next(e for e in updated.tidal_stream_entries if e.hours_from_hw == -3)
    assert peak.spring_rate_knots == pytest.approx(6.0)
    assert len(updated.tidal_stream_entries) == 13


# ── get_diamond_edit_view (raw form prefill) ─────────────────────────────────

def test_edit_view_reconstructs_simple_peaks_and_sets(app, itinerary, id):
    data = {"name": "Race", "location": _loc(), "entry_mode": StreamEntryMode.SIMPLE,
            "max_spring_rate_knots": 3.0, "max_neap_rate_knots": 1.5,
            "flood_direction_degrees": 45, "ebb_direction_degrees": 225, "radius_m": 800}
    station = TidalStationService.create_user_diamond(itinerary["id"], id, data)

    view = TidalStationService.get_diamond_edit_view(str(station.id))
    assert view["entry_mode"] == "simple"
    assert view["radius_m"] == pytest.approx(800)
    assert view["max_spring_rate_knots"] == pytest.approx(3.0)
    assert view["max_neap_rate_knots"] == pytest.approx(1.5)
    assert view["flood_direction_degrees"] == pytest.approx(45)
    assert view["ebb_direction_degrees"] == pytest.approx(225)
    assert len(view["tidal_stream_entries"]) == 13


def test_edit_view_omits_neap_when_it_mirrors_spring(app, itinerary, id):
    # Neap left blank on create → entries carry neap == spring; the view should
    # report no neap so the prefill matches the original blank input.
    station = _simple_diamond(itinerary, id)  # no max_neap_rate_knots
    view = TidalStationService.get_diamond_edit_view(str(station.id))
    assert view["max_spring_rate_knots"] == pytest.approx(3.0)
    assert view["max_neap_rate_knots"] is None


def test_edit_view_atlas_returns_raw_table_and_no_peaks(app, itinerary, id):
    rows = [TidalStreamEntry(hours_from_hw=h, direction_degrees=90,
                             spring_rate_knots=2.0, neap_rate_knots=1.0) for h in range(-6, 7)]
    data = {"name": "Atlas pt", "location": _loc(), "entry_mode": StreamEntryMode.ATLAS,
            "tidal_stream_entries": rows}
    station = TidalStationService.create_user_diamond(itinerary["id"], id, data)

    view = TidalStationService.get_diamond_edit_view(str(station.id))
    assert view["entry_mode"] == "atlas"
    assert view["max_spring_rate_knots"] is None
    assert view["flood_direction_degrees"] is None
    assert len(view["tidal_stream_entries"]) == 13
    assert {e.spring_rate_knots for e in view["tidal_stream_entries"]} == {2.0}


# ── day_diamonds (§2 — resolved at clock hour) ───────────────────────────────

def _simple_diamond(itinerary, user_id, **overrides):
    data = {"name": "Race", "location": _loc(), "entry_mode": StreamEntryMode.SIMPLE,
            "max_spring_rate_knots": 3.0, "flood_direction_degrees": 45, "ebb_direction_degrees": 225}
    data.update(overrides)
    return TidalStationService.create_user_diamond(itinerary["id"], user_id, data)


def _day_with_sea(itinerary, hw=time(12, 0), lw=time(6, 0), range_m=4.0):
    """The itinerary's first day, given a Sea record so the clock hour maps onto the table."""
    day = db.session.get(Day, itinerary["days"][0]["id"])
    day.sea = Sea(day_id=day.id, high_tide=hw, low_tide=lw, tidal_range_m=range_m)
    db.session.commit()
    return day


def test_day_diamonds_resolves_user_diamond_at_hour(app, itinerary, id):
    day = _day_with_sea(itinerary)
    _simple_diamond(itinerary, id, radius_m=500)

    # hour 9 → 3 h before HW(12) → hours_from_hw = -3 → mid-flood peak, flood dir.
    diamonds = TidalService.day_diamonds(day, day.sea, 9)
    assert len(diamonds) == 1
    d = diamonds[0]
    assert d["is_user_created"] is True
    assert d["lat"] == pytest.approx(50.3)
    assert d["lng"] == pytest.approx(-4.1)
    assert d["radius_m"] == pytest.approx(500.0)
    assert d["rate_knots"] == pytest.approx(3.0)
    assert d["direction_degrees"] == pytest.approx(45.0)
    assert len(d["hourly_table"]) == 13


def test_day_diamonds_hour_at_hw_is_ebb_turn(app, itinerary, id):
    day = _day_with_sea(itinerary)
    _simple_diamond(itinerary, id)

    # hour 12 == HW → hours_from_hw = 0 → slack (zero rate) at the ebb turn.
    d = TidalService.day_diamonds(day, day.sea, 12)[0]
    assert d["rate_knots"] == pytest.approx(0.0)
    assert d["direction_degrees"] == pytest.approx(225.0)


def test_day_diamonds_falls_back_to_hw_slack_without_sea(app, itinerary, id):
    day = db.session.get(Day, itinerary["days"][0]["id"])
    _simple_diamond(itinerary, id)

    # No Sea → HW unknown → hours_from_hw defaults to 0 (HW slack) regardless of the hour.
    d = TidalService.day_diamonds(day, None, 9)[0]
    assert d["rate_knots"] == pytest.approx(0.0)
    assert d["direction_degrees"] == pytest.approx(225.0)


def test_day_diamonds_empty_when_none_exist(app, itinerary):
    day = db.session.get(Day, itinerary["days"][0]["id"])
    assert TidalService.day_diamonds(day, None, 12) == []
