class PremiumEntitlementService:
    """No-op self-hosted default for the "is this user entitled to a paid integration"
    check, per ROADMAP.md's "Open-core licensing + premium integrations broker" — Core
    BE always contains this check; a real implementation that calls the Premium Broker
    is wired only in the hosted deployment, never in this (public) repo. Same
    "interface in Core BE, no-op self-hosted default, real implementation swapped in
    at the hosted deployment" shape as `SatelliteFeedSource`.

    STUB: every entitlement currently returns True — nothing is gated yet. Replace
    each check's body when the gating strategy for that feature is actually decided
    and the Premium Broker call exists; do not leave a stub silently gating a feature
    that was meant to ship free.
    """

    @staticmethod
    def has_weather_refresh_access(user_id: str) -> bool:
        return True
