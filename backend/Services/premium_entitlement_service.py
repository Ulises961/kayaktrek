"""Who may use a paid integration.

Routes and tasks never name a concrete class: they call `get_entitlement_provider()`, which
imports whatever `ENTITLEMENT_PROVIDER` (`module:Class`) points at. A deployment with its own
answer sets that variable and ships the class beside the app; every other deployment gets
`PremiumEntitlementService` below. `createApp()` loads the provider once at start-up, so a
mistyped path stops the process instead of failing the first request that needs an answer.
"""

import importlib
from typing import Protocol

from flask import current_app

DEFAULT_ENTITLEMENT_PROVIDER = "Services.premium_entitlement_service:PremiumEntitlementService"

_PROVIDER_METHODS = ("has_weather_refresh_access", "has_extended_forecast_access")


class EntitlementProviderError(RuntimeError):
    """ENTITLEMENT_PROVIDER does not name a usable provider."""


class EntitlementProvider(Protocol):
    def has_weather_refresh_access(self, user_id: str) -> bool: ...

    def has_extended_forecast_access(self, user_id: str) -> bool: ...


class PremiumEntitlementService:
    """The provider a deployment gets when it configures none.

    Closed unless `PREMIUM_FEATURES_OPEN` is set: a cost-exposed action (weather refresh
    triggers metered Open-Meteo calls) must not sit open because nobody decided. A
    self-hosted install that pays for its own Open-Meteo key sets the flag to open them all.
    """

    @staticmethod
    def has_weather_refresh_access(user_id: str) -> bool:
        return _premium_features_open()

    @staticmethod
    def has_extended_forecast_access(user_id: str) -> bool:
        """Gates a forecast horizon wider than FORECAST_HORIZON_DAYS (10, a confidence
        cutoff, not an Open-Meteo limit; docs/adr/features.md §1a). No extended-range
        implementation exists, so opening this changes nothing yet."""
        return _premium_features_open()


def _premium_features_open() -> bool:
    return bool(current_app.config.get("PREMIUM_FEATURES_OPEN"))


def load_entitlement_provider(spec: str) -> EntitlementProvider:
    module_name, separator, class_name = spec.partition(":")
    if not separator or not module_name or not class_name:
        raise EntitlementProviderError(f"ENTITLEMENT_PROVIDER must look like module:Class, got {spec!r}")
    try:
        module = importlib.import_module(module_name)
    except ImportError as error:
        raise EntitlementProviderError(f"cannot import {module_name!r} for ENTITLEMENT_PROVIDER: {error}") from error
    try:
        provider_class = getattr(module, class_name)
    except AttributeError as error:
        raise EntitlementProviderError(f"{module_name!r} has no attribute {class_name!r}") from error
    provider: EntitlementProvider = provider_class()
    for method_name in _PROVIDER_METHODS:
        if not callable(getattr(provider, method_name, None)):
            raise EntitlementProviderError(f"{spec!r} does not implement {method_name}")
    return provider


def get_entitlement_provider() -> EntitlementProvider:
    return load_entitlement_provider(current_app.config.get("ENTITLEMENT_PROVIDER") or DEFAULT_ENTITLEMENT_PROVIDER)
