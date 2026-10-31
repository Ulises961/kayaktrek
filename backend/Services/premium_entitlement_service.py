class PremiumEntitlementService:
    """No-op self-hosted default for the "is this user entitled to a paid integration"
    check, per the product roadmap's "Open-core licensing + premium integrations broker" — Core
    BE always contains this check; a real implementation that calls the Premium Broker
    is wired only in the hosted deployment, never in this (public) repo. Same
    "interface in Core BE, no-op self-hosted default, real implementation swapped in
    at the hosted deployment" shape as `SatelliteFeedSource`.

    STUB: every entitlement currently returns False — closed by default until the
    Premium Broker call exists and a check is deliberately opened. A cost-exposed
    action (this one triggers metered OpenMeteo calls) must not sit open just because
    the gating strategy hasn't been decided yet; flip to True only for a feature that
    is a deliberate, decided free tier.
    """

    @staticmethod
    def has_weather_refresh_access(user_id: str) -> bool:
        return False

    @staticmethod
    def has_extended_forecast_access(user_id: str) -> bool:
        """Gates a forecast horizon wider than FORECAST_HORIZON_DAYS (10, a
        confidence cutoff — not an Open-Meteo technical limit; see
        docs/adr/features.md §1a). Not a built feature — this stub exists only so
        Tasks/weather_beat_task.py's horizon gate is already wired through an
        entitlement check rather than a bare constant, the same "closed by
        default, real implementation swapped in later" shape as
        has_weather_refresh_access above.
        """
        return False
