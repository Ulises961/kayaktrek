from typing import Any, Optional
from uuid import UUID

from Api.database import db
from Models.satellite_feed import SatelliteFeed
from Services.Utils import server_secret_crypto


class SatelliteFeedService:
    @staticmethod
    def list_for_user(user_id: UUID) -> list[SatelliteFeed]:
        return db.session.query(SatelliteFeed).filter_by(user_id=user_id).order_by(SatelliteFeed.created).all()

    @staticmethod
    def get_owned(feed_id: str, user_id: UUID) -> Optional[SatelliteFeed]:
        return db.session.query(SatelliteFeed).filter_by(id=feed_id, user_id=user_id).first()

    @staticmethod
    def create(user_id: UUID, data: dict[str, Any]) -> SatelliteFeed:
        """Raises ValueError("feed_already_registered") if the user already has a
        feed for this provider (one feed per provider per user)."""
        existing = (
            db.session.query(SatelliteFeed)
            .filter_by(user_id=user_id, provider=data["provider"])
            .first()
        )
        if existing is not None:
            raise ValueError("feed_already_registered")

        feed = SatelliteFeed(
            user_id=user_id,
            provider=data["provider"],
            feed_url=data["feed_url"].strip(),
            feed_username=data.get("feed_username"),
        )
        SatelliteFeedService._set_password(feed, data.get("feed_password"))
        db.session.add(feed)
        db.session.commit()
        return feed

    @staticmethod
    def update(feed: SatelliteFeed, data: dict[str, Any]) -> SatelliteFeed:
        """Any successful update clears `needs_reauth` — the user re-entering their
        feed URL/credentials is exactly the recovery action that flag exists for."""
        if "feed_url" in data and data["feed_url"] is not None:
            feed.feed_url = data["feed_url"].strip()
        if "feed_username" in data:
            feed.feed_username = data["feed_username"]
        # Presence decides, not truthiness: an absent key leaves the stored password
        # alone, an explicit null clears it (the only way to remove one without deleting
        # the feed), a value replaces it. Under `partial=True` marshmallow does not apply
        # `load_default`, so an omitted field really is absent from `data` here.
        if "feed_password" in data:
            SatelliteFeedService._set_password(feed, data["feed_password"])
        feed.needs_reauth = False
        db.session.commit()
        return feed

    @staticmethod
    def delete(feed: SatelliteFeed) -> None:
        db.session.delete(feed)
        db.session.commit()

    @staticmethod
    def _set_password(feed: SatelliteFeed, password: Optional[str]) -> None:
        if not password:
            feed.feed_password_ciphertext = None
            feed.feed_password_nonce = None
            return
        ciphertext, nonce = server_secret_crypto.encrypt(password)
        feed.feed_password_ciphertext = ciphertext
        feed.feed_password_nonce = nonce
