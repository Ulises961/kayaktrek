"""Tests for RDP simplification, geo utils, JSON encoder, weather state schema, and data export helpers."""
import json
import math
import types
from datetime import date, datetime
from uuid import UUID, uuid4

import pytest
from marshmallow import ValidationError

from Services.Utils.geo_utils import haversine_nm
from Services.Utils.json_encoder import CustomJSONEncoder
from Services.Utils.rdp import _perp_distance, rdp_simplify
from Schemas.weather_state_schema import WeatherStateSchema
from Tasks.data_export import _build_export, _json_default


# ── _perp_distance ────────────────────────────────────────────────────────────

def test_perp_distance_degenerate_start_equals_end():
    # start == end → falls back to straight-line distance from point to start
    assert _perp_distance((1.0, 1.0), (0.0, 0.0), (0.0, 0.0)) == pytest.approx(math.hypot(1.0, 1.0))


def test_perp_distance_point_on_segment():
    # midpoint of the segment has zero perpendicular distance
    assert _perp_distance((0.5, 0.5), (0.0, 0.0), (1.0, 1.0)) == pytest.approx(0.0, abs=1e-9)


def test_perp_distance_point_off_segment():
    # (1,0) is sqrt(2)/2 from the line (0,0)→(1,1)
    assert _perp_distance((1.0, 0.0), (0.0, 0.0), (1.0, 1.0)) == pytest.approx(math.sqrt(2) / 2, rel=1e-6)


# ── rdp_simplify ──────────────────────────────────────────────────────────────

def test_rdp_simplify_empty():
    assert rdp_simplify([], 0.001) == []


def test_rdp_simplify_single_point():
    assert rdp_simplify([(1.0, 2.0)], 0.001) == [(1.0, 2.0)]


def test_rdp_simplify_two_points_unchanged():
    pts = [(0.0, 0.0), (1.0, 1.0)]
    assert rdp_simplify(pts, 0.001) == pts


def test_rdp_simplify_collinear_removes_middle():
    # Middle point lies on the line — should be dropped
    pts = [(0.0, 0.0), (0.5, 0.5), (1.0, 1.0)]
    assert rdp_simplify(pts, 0.001) == [(0.0, 0.0), (1.0, 1.0)]


def test_rdp_simplify_bend_preserves_vertex():
    # Clear right-angle bend — middle point must be kept
    pts = [(0.0, 0.0), (1.0, 1.0), (2.0, 0.0)]
    assert rdp_simplify(pts, 0.001) == [(0.0, 0.0), (1.0, 1.0), (2.0, 0.0)]


def test_rdp_simplify_large_epsilon_collapses_to_endpoints():
    pts = [(0.0, 0.0), (1.0, 0.5), (2.0, 1.0), (3.0, 0.2), (4.0, 0.0)]
    assert rdp_simplify(pts, 10.0) == [(0.0, 0.0), (4.0, 0.0)]


def test_rdp_simplify_recursive_two_bends():
    # Two sharp peaks at y=5 — both must survive simplification
    pts = [(0.0, 0.0), (1.0, 5.0), (2.0, 0.0), (3.0, 5.0), (4.0, 0.0)]
    result = rdp_simplify(pts, 0.5)
    assert (1.0, 5.0) in result
    assert (3.0, 5.0) in result


# ── haversine_nm ──────────────────────────────────────────────────────────────

def test_haversine_nm_same_point_is_zero():
    assert haversine_nm(51.5, -0.1, 51.5, -0.1) == pytest.approx(0.0)


def test_haversine_nm_one_degree_latitude():
    # 1° latitude ≈ 60.04 nm at the equator
    d = haversine_nm(0.0, 0.0, 1.0, 0.0)
    assert d == pytest.approx(60.04, rel=0.005)


def test_haversine_nm_one_degree_longitude_at_equator():
    # 1° longitude at equator ≈ same as 1° latitude
    d = haversine_nm(0.0, 0.0, 0.0, 1.0)
    assert d == pytest.approx(60.04, rel=0.005)


def test_haversine_nm_symmetrical():
    # Distance A→B == distance B→A
    assert haversine_nm(50.0, -4.0, 51.0, -3.0) == pytest.approx(
        haversine_nm(51.0, -3.0, 50.0, -4.0)
    )


# ── CustomJSONEncoder ─────────────────────────────────────────────────────────

def test_json_encoder_uuid_to_str():
    uid = UUID("12345678-1234-5678-1234-567812345678")
    result = json.dumps({"id": uid}, cls=CustomJSONEncoder)
    assert "12345678-1234-5678-1234-567812345678" in result


def test_json_encoder_datetime_to_iso():
    dt = datetime(2025, 6, 1, 12, 0, 0)
    result = json.dumps({"ts": dt}, cls=CustomJSONEncoder)
    assert "2025-06-01T12:00:00" in result


def test_json_encoder_unknown_type_raises():
    class _Opaque:
        pass
    encoder = CustomJSONEncoder()
    with pytest.raises(TypeError):
        encoder.default(_Opaque())


# ── WeatherStateSchema ────────────────────────────────────────────────────────

@pytest.fixture
def ws_schema():
    return WeatherStateSchema()


def _valid_ws():
    return {
        "day_id": str(uuid4()),
        "time": "12:00:00",
        "temperature": 15.0,
        "precipitation": 2.5,
        "wind_direction": 270.0,
        "wind_force": 25.0,
        "cloud": "Partly cloudy",
    }


def test_weather_state_schema_valid_load(app, ws_schema):
    obj = ws_schema.load(_valid_ws())
    assert obj.temperature == 15.0


def test_weather_state_schema_temperature_too_low(app, ws_schema):
    with pytest.raises(ValidationError) as exc:
        ws_schema.load({**_valid_ws(), "temperature": -91.0})
    assert "temperature" in exc.value.messages


def test_weather_state_schema_temperature_too_high(app, ws_schema):
    with pytest.raises(ValidationError) as exc:
        ws_schema.load({**_valid_ws(), "temperature": 61.0})
    assert "temperature" in exc.value.messages


def test_weather_state_schema_precipitation_negative(app, ws_schema):
    with pytest.raises(ValidationError) as exc:
        ws_schema.load({**_valid_ws(), "precipitation": -1.0})
    assert "precipitation" in exc.value.messages


def test_weather_state_schema_precipitation_too_high(app, ws_schema):
    with pytest.raises(ValidationError) as exc:
        ws_schema.load({**_valid_ws(), "precipitation": 501.0})
    assert "precipitation" in exc.value.messages


def test_weather_state_schema_wind_direction_out_of_range(app, ws_schema):
    with pytest.raises(ValidationError) as exc:
        ws_schema.load({**_valid_ws(), "wind_direction": 361.0})
    assert "windDirection" in exc.value.messages


def test_weather_state_schema_wind_force_negative(app, ws_schema):
    with pytest.raises(ValidationError) as exc:
        ws_schema.load({**_valid_ws(), "wind_force": -5.0})
    assert "windForce" in exc.value.messages


def test_weather_state_schema_wind_force_too_high(app, ws_schema):
    with pytest.raises(ValidationError) as exc:
        ws_schema.load({**_valid_ws(), "wind_force": 201.0})
    assert "windForce" in exc.value.messages


def test_weather_state_schema_cloud_too_long(app, ws_schema):
    with pytest.raises(ValidationError) as exc:
        ws_schema.load({**_valid_ws(), "cloud": "x" * 51})
    assert "cloud" in exc.value.messages


# ── data_export._json_default ─────────────────────────────────────────────────

def test_json_default_datetime():
    assert _json_default(datetime(2025, 1, 15, 9, 30, 0)) == "2025-01-15T09:30:00"


def test_json_default_date():
    assert _json_default(date(2025, 6, 1)) == "2025-06-01"


def test_json_default_unknown_type_raises():
    with pytest.raises(TypeError):
        _json_default(object())


# ── data_export._build_export ─────────────────────────────────────────────────

def _mock_user():
    return types.SimpleNamespace(
        id=uuid4(),
        mail="test@example.com",
        username="testuser",
        name="Test",
        surname="User",
        phone=None,
        avatar_url=None,
        admin=False,
        created=datetime(2024, 1, 1),
        vessel_make=None,
        vessel_model=None,
        vessel_length_cm=None,
        vessel_color_primary=None,
        vessel_color_secondary=None,
        emergency_contact_name=None,
        emergency_contact_phone=None,
        emergency_contact_relationship=None,
        medical_notes_consent_at=None,
        trip_memberships=[],
        logs=[],
        endorsed_logs=[],
        certifications=[],
    )


def test_build_export_top_level_keys():
    result = _build_export(_mock_user())
    for key in ("exportedAt", "profile", "vessel", "emergencyContact", "trips", "logs", "endorsedLogs", "certifications"):
        assert key in result


def test_build_export_profile_fields():
    user = _mock_user()
    result = _build_export(user)
    assert result["profile"]["mail"] == "test@example.com"
    assert result["profile"]["id"] == str(user.id)


def test_build_export_empty_collections():
    result = _build_export(_mock_user())
    assert result["trips"] == []
    assert result["logs"] == []
    assert result["endorsedLogs"] == []
    assert result["certifications"] == []


def test_build_export_is_json_serialisable():
    # The whole payload must round-trip through json.dumps using _json_default
    result = _build_export(_mock_user())
    serialised = json.dumps(result, default=_json_default)
    assert "test@example.com" in serialised
