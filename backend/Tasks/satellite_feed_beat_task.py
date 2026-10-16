import logging
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from celery import Task
import requests

from Api.celery_app import celery_app
from Api.database import db
from Models.satellite_feed import SatelliteFeed
from Models.trip import Trip, TripStateType
from Models.trip_member import TripMember
from Services.live_position_service import LivePositionService
from Services.SatelliteFeeds.base import (
    FeedAuthError,
    FeedParseError,
    FeedUnavailableError,
    PreparedFeedRequest,
)
from Services.SatelliteFeeds.registry import get_source
from Services.Utils import server_secret_crypto

logger = logging.getLogger(__name__)


def _decrypted_credentials(feed: SatelliteFeed) -> Optional[dict[str, str]]:
    if not feed.feed_username and not feed.feed_password_ciphertext:
        return None
    password = ""
    if feed.feed_password_ciphertext and feed.feed_password_nonce:
        password = server_secret_crypto.decrypt(feed.feed_password_ciphertext, feed.feed_password_nonce)
    return {"username": feed.feed_username or "", "password": password}


def _fetch(request: PreparedFeedRequest) -> bytes:
    try:
        response = requests.get(request.url, headers=request.headers, timeout=request.timeout_seconds)
    except requests.RequestException as e:
        raise FeedUnavailableError(str(e))
    if response.status_code in (401, 403):
        raise FeedAuthError(f"status={response.status_code}")
    if response.status_code >= 500:
        raise FeedUnavailableError(f"status={response.status_code}")
    if response.status_code != 200:
        raise FeedUnavailableError(f"status={response.status_code}")
    return response.content


def _happening_trip_ids(user_id: UUID) -> list[UUID]:
    return [
        trip_id
        for (trip_id,) in db.session.query(TripMember.trip_id)
        .join(Trip, Trip.id == TripMember.trip_id)
        .filter(TripMember.user_id == user_id, Trip.state == TripStateType.HAPPENING)
        .all()
    ]


@celery_app.task(name="Tasks.satellite_feed_beat_task.poll_satellite_feeds", bind=True)
def poll_satellite_feeds(self: Task, request_id: Optional[str] = None) -> None:
    """Poll every enabled satellite feed and ingest new positions into any of the
    user's currently HAPPENING trips through LivePositionService (M8's pipeline).

    Runs on a fixed interval (see Api/celery_app.py beat_schedule) — matches inReach's
    own typical ~10-minute tracking interval (satellite-feed-spec.md §3.1). A feed with
    no HAPPENING trip still advances `last_ingested_at`, so a paddler between trips
    doesn't build up an unbounded backlog the next feed poll would have to re-parse.
    """
    now = datetime.now(timezone.utc)
    feeds = db.session.query(SatelliteFeed).filter(SatelliteFeed.needs_reauth.is_(False)).all()

    ingested = 0
    failed = 0
    for feed in feeds:
        source = get_source(feed.provider)
        try:
            credentials = _decrypted_credentials(feed)
            prepared = source.build_request(feed.feed_url, credentials, feed.last_ingested_at)
            raw = _fetch(prepared)
            positions = source.parse(raw, feed.last_ingested_at)

            trip_ids = _happening_trip_ids(feed.user_id)
            for position in positions:
                for trip_id in trip_ids:
                    try:
                        LivePositionService.record_ping(
                            str(trip_id),
                            str(feed.user_id),
                            {"lat": position.lat, "lon": position.lng, "recorded_at": position.timestamp},
                        )
                    except ValueError:
                        # Trip state changed between the query above and this ping
                        # (e.g. the crew ended the trip mid-poll) — not this feed's
                        # failure, skip and keep processing the rest of the batch.
                        logger.warning(
                            "satellite_feed_ping_skipped",
                            extra={"feed_id": str(feed.id), "trip_id": str(trip_id)},
                        )

            if positions:
                feed.last_ingested_at = positions[-1].timestamp
            feed.last_polled_at = now
            db.session.commit()
            ingested += 1
        except FeedAuthError:
            feed.needs_reauth = True
            feed.last_polled_at = now
            db.session.commit()
            logger.warning("satellite_feed_needs_reauth", extra={"feed_id": str(feed.id)})
            failed += 1
        except (FeedUnavailableError, FeedParseError) as e:
            db.session.rollback()
            logger.warning(
                "satellite_feed_poll_failed",
                extra={"feed_id": str(feed.id), "provider": feed.provider.value, "error": str(e)},
            )
            failed += 1

    logger.info(
        "satellite_feed_beat_dispatched",
        extra={"task_id": self.request.id, "request_id": request_id, "ingested": ingested, "failed": failed},
    )
