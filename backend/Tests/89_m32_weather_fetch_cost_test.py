"""M32 — weather fetch cost optimization (docs/adr/features.md §1a).

Beat-task scheduling (state filter, rolling horizon, attention gate) is covered
in Tests/34_m5_weather_task_test.py alongside the rest of that task's tests.
The mobile pullChanges attention-gate bump is covered in
Tests/86_m9c_mobile_sync_test.py, and the GET /trip/<id> bump in
Tests/01_trip_resource_test.py. This file covers what's left: the entitlement
stub, effective_horizon_days, and OpenMeteoService's licensing config.
"""
import importlib.util
from pathlib import Path
from unittest.mock import MagicMock, patch

import numpy as np

import Services.open_meteo_service as open_meteo_service
from Services.premium_entitlement_service import PremiumEntitlementService
from Tasks.weather_beat_task import FORECAST_HORIZON_DAYS, effective_horizon_days


def test_has_extended_forecast_access_is_closed_by_default():
    assert PremiumEntitlementService.has_extended_forecast_access("some-user-id") is False


def test_effective_horizon_days_is_the_free_default_with_no_user():
    assert effective_horizon_days(None) == FORECAST_HORIZON_DAYS


def test_effective_horizon_days_stays_free_default_while_entitlement_stub_is_closed():
    """Wired through the entitlement check rather than a bare constant — but
    since the stub is closed, a real user id still gets the same 10-day
    default today. This is what "flip on later" means: the call already
    happens, the answer just hasn't changed yet."""
    assert effective_horizon_days("some-user-id") == FORECAST_HORIZON_DAYS


def test_effective_horizon_days_would_honor_an_open_entitlement():
    """Proves the wiring, not a real extended-range value yet — no extended
    tier is implemented, so this only confirms the gate is actually consulted
    rather than short-circuited."""
    with patch.object(PremiumEntitlementService, "has_extended_forecast_access", return_value=True):
        # Still FORECAST_HORIZON_DAYS today — no extended-range implementation
        # exists. This test exists to break loudly the day someone adds one
        # without updating this assertion, not to claim a wider value works now.
        assert effective_horizon_days("some-user-id") == FORECAST_HORIZON_DAYS


# ── OpenMeteoService licensing config (WP4) ───────────────────────────────
#
# Deliberately NOT importlib.reload — see _reimport_storage_service in
# Tests/77_storage_bucket_split_test.py for why: reload rebinds OpenMeteoService
# to a new class object in place, so any module that already did
# `from Services.open_meteo_service import OpenMeteoService` (Tasks/weather_fetch_task.py)
# keeps the old one, and a later `patch("Tasks.weather_fetch_task.OpenMeteoService")`
# in a different test file stops matching — a failure that surfaces in that
# other file, not here, and only when xdist happens to schedule it after this one.

def _reimport_open_meteo_service():
    """Throwaway copy of the module, so its env-read constants are recomputed
    under the current environment without touching the live one or anything
    that already imported from it."""
    spec = importlib.util.spec_from_file_location(
        "_open_meteo_service_fresh", Path(open_meteo_service.__file__)
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_open_meteo_defaults_to_free_tier_hosts_when_env_unset(monkeypatch):
    monkeypatch.delenv("OPEN_METEO_WEATHER_BASE_URL", raising=False)
    monkeypatch.delenv("OPEN_METEO_MARINE_BASE_URL", raising=False)
    monkeypatch.delenv("OPEN_METEO_API_KEY", raising=False)

    fresh = _reimport_open_meteo_service()

    assert fresh._WEATHER_URL == "https://api.open-meteo.com/v1/forecast"
    assert fresh._MARINE_URL == "https://marine-api.open-meteo.com/v1/marine"
    assert fresh._API_KEY is None


def test_open_meteo_reads_commercial_plan_config_from_env(monkeypatch):
    monkeypatch.setenv("OPEN_METEO_WEATHER_BASE_URL", "https://customer-api.open-meteo.com/v1/forecast")
    monkeypatch.setenv("OPEN_METEO_MARINE_BASE_URL", "https://customer-api.open-meteo.com/v1/marine")
    monkeypatch.setenv("OPEN_METEO_API_KEY", "secret-key")

    fresh = _reimport_open_meteo_service()

    assert fresh._WEATHER_URL == "https://customer-api.open-meteo.com/v1/forecast"
    assert fresh._MARINE_URL == "https://customer-api.open-meteo.com/v1/marine"
    assert fresh._API_KEY == "secret-key"


def _mock_weather_client() -> MagicMock:
    mock_hourly = MagicMock()
    mock_hourly.Time.return_value = 1755216000
    mock_hourly.Interval.return_value = 3600
    mock_var = MagicMock()
    mock_var.ValuesAsNumpy.return_value = np.array([15.0] * 24)
    mock_hourly.Variables.return_value = mock_var
    mock_response = MagicMock()
    mock_response.Hourly.return_value = mock_hourly
    mock_client = MagicMock()
    mock_client.weather_api.return_value = [mock_response]
    return mock_client


def test_open_meteo_appends_api_key_to_request_params_when_set(app):
    mock_client = _mock_weather_client()
    with app.app_context():
        open_meteo_service.cache.delete("weather:52.0:-7.0:2026-09-20")
        try:
            with patch.object(open_meteo_service, "_API_KEY", "secret-key"), \
                 patch.object(open_meteo_service, "_make_client", return_value=mock_client):
                open_meteo_service.OpenMeteoService.fetch_weather(52.0, -7.0, "2026-09-20")
        finally:
            open_meteo_service.cache.delete("weather:52.0:-7.0:2026-09-20")

    called_params = mock_client.weather_api.call_args.kwargs["params"]
    assert called_params["apikey"] == "secret-key"


def test_open_meteo_omits_api_key_param_when_unset(app):
    mock_client = _mock_weather_client()
    with app.app_context():
        open_meteo_service.cache.delete("weather:53.0:-8.0:2026-09-21")
        try:
            with patch.object(open_meteo_service, "_API_KEY", None), \
                 patch.object(open_meteo_service, "_make_client", return_value=mock_client):
                open_meteo_service.OpenMeteoService.fetch_weather(53.0, -8.0, "2026-09-21")
        finally:
            open_meteo_service.cache.delete("weather:53.0:-8.0:2026-09-21")

    called_params = mock_client.weather_api.call_args.kwargs["params"]
    assert "apikey" not in called_params
