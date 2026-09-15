import logging
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from Api.celery_app import celery_app
from Api.database import db
from Models.day import Day
from Models.itinerary import Itinerary
from Models.trip import Trip, TripStateType
from Services.premium_entitlement_service import PremiumEntitlementService
from Tasks.weather_fetch_task import fetch_weather

logger = logging.getLogger(__name__)

# A confidence cutoff, not an Open-Meteo technical limit (their API returns data
# out to ~16 days regardless, just at declining confidence) — docs/adr/features.md
# §1a. Must never be sized against trip length: the beat query below re-evaluates
# against date.today() on every tick, so a day further out than this rolls into
# range on its own as "today" advances, with no horizon widening ever required.
FORECAST_HORIZON_DAYS = 10

# A trip nobody has viewed (web or mobile sync-down) in this many days is skipped
# by both schedules below, resuming on the very next view.
ATTENTION_TIMEOUT_DAYS = 7


def effective_horizon_days(user_id: Optional[str]) -> int:
    """Wired through PremiumEntitlementService.has_extended_forecast_access rather
    than returning FORECAST_HORIZON_DAYS directly, so a future extended-range
    premium tier (ROADMAP.md "Weather forecast resolution & refresh control") is a
    matter of flipping that stub, not re-deriving this gate. Always the free
    10-day cutoff today — the stub is closed by default. user_id is None for the
    beat sweep itself, which has no single "requesting user" — always the free
    default in that case.
    """
    if user_id and PremiumEntitlementService.has_extended_forecast_access(user_id):
        return FORECAST_HORIZON_DAYS  # no extended-range implementation exists yet
    return FORECAST_HORIZON_DAYS


def _attention_cutoff() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=ATTENTION_TIMEOUT_DAYS)


def _dispatch(days: list[Day], request_id: Optional[str]) -> int:
    for day in days:
        fetch_weather.delay(str(day.id), request_id=request_id)
    return len(days)


@celery_app.task(name="Tasks.weather_beat_task.refresh_upcoming_weather", bind=True)
def refresh_upcoming_weather(self, request_id: Optional[str] = None) -> None:
    """Once-daily broad sweep — building/happening trips, inside the horizon,
    not dormant. docs/adr/features.md §1a."""
    today = date.today()
    # No single "requesting user" for a beat sweep — effective_horizon_days(None)
    # is always the free FORECAST_HORIZON_DAYS default. Called through the function
    # rather than the constant directly so a future per-trip extended-range check
    # (once has_extended_forecast_access is real) slots in here without touching
    # this query.
    cutoff = today + timedelta(days=effective_horizon_days(None))
    attention_cutoff = _attention_cutoff()

    days = (
        db.session.query(Day)
        .join(Itinerary, Day.itinerary_id == Itinerary.id)
        .join(Trip, Itinerary.trip_id == Trip.id)
        .filter(
            Day.date.isnot(None),
            Day.date >= today,
            Day.date <= cutoff,
            Trip.state.in_([TripStateType.BUILDING, TripStateType.HAPPENING]),
            (Trip.last_accessed_at.is_(None)) | (Trip.last_accessed_at >= attention_cutoff),
        )
        .all()
    )

    count = _dispatch(days, request_id)
    logger.info(
        "weather_beat_dispatched",
        extra={"count": count, "today": str(today), "cutoff": str(cutoff)},
    )


@celery_app.task(name="Tasks.weather_beat_task.refresh_urgent_weather", bind=True)
def refresh_urgent_weather(self, request_id: Optional[str] = None) -> None:
    """Every-6h narrow sweep — happening trips, or any day within 48h, not
    dormant. A much smaller candidate set than the daily sweep, so the added
    beat frequency costs little. docs/adr/features.md §1a."""
    today = date.today()
    # Day.date has no time component, so "within 48h" is expressed in whole days —
    # today or tomorrow, never today+2, since a Day dated two calendar days out
    # could be as little as ~24h away (e.g. dispatched at 23:00) or as much as
    # ~72h away; rounding down keeps this sweep from silently widening into the
    # daily sweep's job.
    imminent_cutoff = today + timedelta(days=1)
    attention_cutoff = _attention_cutoff()

    days = (
        db.session.query(Day)
        .join(Itinerary, Day.itinerary_id == Itinerary.id)
        .join(Trip, Itinerary.trip_id == Trip.id)
        .filter(
            Day.date.isnot(None),
            Day.date >= today,
            # A past/archived trip must never be dispatched by either schedule —
            # the OR below only decides WHICH building/happening days qualify as
            # "urgent," it must never be able to admit a past/archived trip on its
            # own via the Day.date <= imminent_cutoff arm.
            Trip.state.in_([TripStateType.BUILDING, TripStateType.HAPPENING]),
            (Trip.state == TripStateType.HAPPENING) | (Day.date <= imminent_cutoff),
            (Trip.last_accessed_at.is_(None)) | (Trip.last_accessed_at >= attention_cutoff),
        )
        .all()
    )

    count = _dispatch(days, request_id)
    logger.info(
        "weather_beat_urgent_dispatched",
        extra={"count": count, "today": str(today)},
    )
