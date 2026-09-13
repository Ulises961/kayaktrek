class PremiumEntitlementService:
    """No-op self-hosted default for the "is this user entitled to a paid integration"
    check, per ROADMAP.md's "Open-core licensing + premium integrations broker" — Core
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
