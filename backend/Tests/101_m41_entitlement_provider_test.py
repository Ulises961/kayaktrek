"""M41 WP2 — the entitlement provider is chosen by configuration, not by an import.

The routes and the beat task ask `get_entitlement_provider()` who may use a paid
integration. A deployment that has its own answer sets `ENTITLEMENT_PROVIDER` to
`module:Class`; everyone else gets `PremiumEntitlementService`, which is closed unless
`PREMIUM_FEATURES_OPEN` says otherwise.
"""
import sys
from types import ModuleType
from unittest.mock import patch

import pytest

from Api.app import createApp
from Api.config import config
from Services.premium_entitlement_service import (
    EntitlementProviderError,
    PremiumEntitlementService,
    get_entitlement_provider,
    load_entitlement_provider,
)
from Tasks.weather_beat_task import effective_horizon_days

FAKE_MODULE_NAME = "fake_entitlements_for_tests"


class RecordingProvider:
    """A deployment's own provider: records who was asked and grants everything."""

    asked_about: list[str] = []

    def has_weather_refresh_access(self, user_id: str) -> bool:
        RecordingProvider.asked_about.append(user_id)
        return True

    def has_extended_forecast_access(self, user_id: str) -> bool:
        RecordingProvider.asked_about.append(user_id)
        return True


class ProviderMissingAMethod:
    def has_weather_refresh_access(self, user_id: str) -> bool:
        return True


@pytest.fixture
def fake_provider_module():
    module = ModuleType(FAKE_MODULE_NAME)
    module.RecordingProvider = RecordingProvider  # type: ignore[attr-defined]
    module.ProviderMissingAMethod = ProviderMissingAMethod  # type: ignore[attr-defined]
    RecordingProvider.asked_about = []
    with patch.dict(sys.modules, {FAKE_MODULE_NAME: module}):
        yield module


def test_default_provider_is_the_closed_stub(app):
    provider = get_entitlement_provider()

    assert isinstance(provider, PremiumEntitlementService)
    assert provider.has_weather_refresh_access("some-user-id") is False
    assert provider.has_extended_forecast_access("some-user-id") is False
    assert not app.config["ENTITLEMENT_PROVIDER"]


def test_premium_features_open_opens_the_default_provider(app):
    with patch.dict(app.config, {"PREMIUM_FEATURES_OPEN": True}):
        provider = get_entitlement_provider()

        assert provider.has_weather_refresh_access("some-user-id") is True
        assert provider.has_extended_forecast_access("some-user-id") is True


def test_testing_config_pins_the_provider_settings():
    # A developer's .env must not change what this suite asserts about the default provider.
    assert config["testing"].ENTITLEMENT_PROVIDER == ""
    assert config["testing"].PREMIUM_FEATURES_OPEN is False


def test_configured_provider_replaces_the_default(app, fake_provider_module):
    spec = f"{FAKE_MODULE_NAME}:RecordingProvider"
    with patch.dict(app.config, {"ENTITLEMENT_PROVIDER": spec}):
        provider = get_entitlement_provider()

        assert isinstance(provider, RecordingProvider)
        assert provider.has_weather_refresh_access("user-1") is True


def test_beat_horizon_consults_the_configured_provider(app, fake_provider_module):
    spec = f"{FAKE_MODULE_NAME}:RecordingProvider"
    with patch.dict(app.config, {"ENTITLEMENT_PROVIDER": spec}):
        effective_horizon_days("user-1")

    assert RecordingProvider.asked_about == ["user-1"]


@pytest.mark.parametrize(
    "spec, reason",
    [
        ("no_colon_here", "module:Class"),
        (":OnlyAClass", "module:Class"),
        ("OnlyAModule:", "module:Class"),
        ("module_that_does_not_exist_41:Anything", "cannot import"),
        ("Services.premium_entitlement_service:NoSuchClass", "has no attribute"),
        (f"{FAKE_MODULE_NAME}:ProviderMissingAMethod", "has_extended_forecast_access"),
    ],
)
def test_a_bad_provider_spec_is_rejected_with_a_clear_message(fake_provider_module, spec, reason):
    with pytest.raises(EntitlementProviderError, match=reason):
        load_entitlement_provider(spec)


def test_app_refuses_to_start_with_a_bad_provider():
    # Caught when the process starts, not on the first request that needs an answer.
    with patch.object(config["testing"], "ENTITLEMENT_PROVIDER", "module_that_does_not_exist_41:Anything"):
        with pytest.raises(EntitlementProviderError):
            createApp("testing")
