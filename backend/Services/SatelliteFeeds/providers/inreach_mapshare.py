import base64
from datetime import datetime, timezone
from typing import ClassVar, Optional

import defusedxml.ElementTree

from Services.SatelliteFeeds.base import (
    FeedParseError,
    PreparedFeedRequest,
    SatelliteFeedSource,
)
from Services.SatelliteFeeds.types import NormalizedPosition, SatelliteProvider

_KML_NS = {"kml": "http://www.opengis.net/kml/2.2"}


class InReachMapShareSource(SatelliteFeedSource):
    """Garmin inReach MapShare — KML feed, no API account (satellite-feed-spec.md §3.1).

    Without `d1`/`d2` the feed returns only the single most recent point, so
    `build_request` omits the time window entirely on a first poll (`since is None`) —
    that intentionally yields just the latest point rather than guessing a backfill
    window — and always passes `d1=since` on every later poll.
    """

    provider: ClassVar[SatelliteProvider] = SatelliteProvider.INREACH_MAPSHARE

    def build_request(
        self,
        feed_url: str,
        credentials: Optional[dict[str, str]],
        since: Optional[datetime],
    ) -> PreparedFeedRequest:
        params = []
        if since is not None:
            d1 = since.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%Sz")
            d2 = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%Sz")
            params = [f"d1={d1}", f"d2={d2}"]
        url = feed_url + ("?" + "&".join(params) if params else "")

        headers = {}
        if credentials and credentials.get("username"):
            token = base64.b64encode(
                f"{credentials['username']}:{credentials.get('password', '')}".encode()
            ).decode()
            headers["Authorization"] = f"Basic {token}"

        return PreparedFeedRequest(url=url, headers=headers)

    def parse(self, raw: bytes, since: Optional[datetime]) -> list[NormalizedPosition]:
        try:
            root = defusedxml.ElementTree.fromstring(raw)
        except Exception as e:
            raise FeedParseError(str(e))

        positions = []
        for placemark in root.iter("{http://www.opengis.net/kml/2.2}Placemark"):
            timestamp = self._extract_timestamp(placemark)
            coords = self._extract_coordinates(placemark)
            if timestamp is None or coords is None:
                continue
            if since is not None and timestamp <= since:
                continue
            lng, lat = coords
            positions.append(
                NormalizedPosition(lat=lat, lng=lng, timestamp=timestamp, source=self.provider)
            )

        positions.sort(key=lambda p: p.timestamp)
        return positions

    @staticmethod
    def _extract_timestamp(placemark) -> Optional[datetime]:
        # ExtendedData "Time UTC" is preferred — it's explicitly UTC, unlike the
        # placemark <name> which the KML feed docs describe as ISO 8601 UTC but which
        # some MapShare configurations have been observed to render in local time.
        for data in placemark.iter("{http://www.opengis.net/kml/2.2}Data"):
            if data.get("name") == "Time UTC":
                value = data.find("{http://www.opengis.net/kml/2.2}value")
                if value is not None and value.text:
                    return InReachMapShareSource._parse_iso(value.text)

        name = placemark.find("{http://www.opengis.net/kml/2.2}name")
        if name is not None and name.text:
            return InReachMapShareSource._parse_iso(name.text)
        return None

    @staticmethod
    def _parse_iso(text: str) -> Optional[datetime]:
        try:
            parsed = datetime.fromisoformat(text.strip().replace("Z", "+00:00").replace("z", "+00:00"))
        except ValueError:
            return None
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)

    @staticmethod
    def _extract_coordinates(placemark) -> Optional[tuple[float, float]]:
        point = placemark.find(
            "{http://www.opengis.net/kml/2.2}Point/{http://www.opengis.net/kml/2.2}coordinates"
        )
        if point is None or not point.text:
            return None
        parts = point.text.strip().split(",")
        if len(parts) < 2:
            return None
        try:
            lng, lat = float(parts[0]), float(parts[1])
        except ValueError:
            return None
        return (lng, lat)
