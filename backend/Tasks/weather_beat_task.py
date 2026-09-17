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


def _due_days(today: date):
    """Every day either sweep may fetch: a building/happening trip viewed within
    ATTENTION_TIMEOUT_DAYS, dated inside the forecast horizon. A NULL
    last_accessed_at is skipped — there is no view to measure dormancy from.

    effective_horizon_days(None): a sweep has no single requesting user, so it
    always gets the free default.
    """
    horizon_cutoff = today + timedelta(days=effective_horizon_days(None))
    return (
        db.session.query(Day)
        .join(Itinerary, Day.itinerary_id == Itinerary.id)
        .join(Trip, Itinerary.trip_id == Trip.id)
        .filter(
            Day.date.isnot(None),
            Day.date >= today,
            Day.date <= horizon_cutoff,
            Trip.state.in_([TripStateType.BUILDING, TripStateType.HAPPENING]),
            Trip.last_accessed_at >= _attention_cutoff(),
        )
    )


def _is_urgent(today: date):
    """A happening trip, or a day today or tomorrow. Day.date has no time, so
    "within 48h" rounds down to whole days: a day two dates out can be as much
    as ~72h away."""
    return (Trip.state == TripStateType.HAPPENING) | (Day.date <= today + timedelta(days=1))


def _dispatch(days: list[Day], request_id: Optional[str]) -> int:
    for day in days:
        fetch_weather.delay(str(day.id), request_id=request_id)
    return len(days)


@celery_app.task(name="Tasks.weather_beat_task.refresh_upcoming_weather", bind=True)
def refresh_upcoming_weather(self, request_id: Optional[str] = None) -> None:
    """Once-daily sweep of the due days the 6h sweep doesn't own, so no day is
    fetched by both. docs/adr/features.md §1a."""
    today = date.today()
    days = _due_days(today).filter(~_is_urgent(today)).all()

    count = _dispatch(days, request_id)
    logger.info("weather_beat_dispatched", extra={"count": count, "today": str(today)})


@celery_app.task(name="Tasks.weather_beat_task.refresh_urgent_weather", bind=True)
def refresh_urgent_weather(self, request_id: Optional[str] = None) -> None:
    """Every-6h sweep of due days on happening trips or dated today/tomorrow.
    docs/adr/features.md §1a."""
    today = date.today()
    days = _due_days(today).filter(_is_urgent(today)).all()

    count = _dispatch(days, request_id)
    logger.info("weather_beat_urgent_dispatched", extra={"count": count, "today": str(today)})
