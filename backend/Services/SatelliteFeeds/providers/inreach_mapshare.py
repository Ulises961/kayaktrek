import base64
import re
from datetime import datetime, timezone
from typing import ClassVar, Optional
from xml.etree.ElementTree import Element

import defusedxml.ElementTree

from Services.SatelliteFeeds.base import (
    FeedParseError,
    PreparedFeedRequest,
    SatelliteFeedSource,
)
from Services.SatelliteFeeds.types import NormalizedPosition, SatelliteProvider

_LEADING_NUMBER = re.compile(r"\s*(-?\d+(?:\.\d+)?)")
_KILOMETRES_PER_HOUR_TO_METRES_PER_SECOND = 1 / 3.6

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
                NormalizedPosition(
                    lat=lat,
                    lng=lng,
                    timestamp=timestamp,
                    source=self.provider,
                    heading_deg=self._extract_heading_deg(placemark),
                    speed_ms=self._extract_speed_ms(placemark),
                )
            )

        positions.sort(key=lambda p: p.timestamp)
        return positions

    @staticmethod
    def _extract_timestamp(placemark: Element) -> Optional[datetime]:
        # ExtendedData "Time UTC" is preferred — it's explicitly UTC, unlike the
        # placemark <name> which the KML feed docs describe as ISO 8601 UTC but which
        # some MapShare configurations have been observed to render in local time.
        time_utc = InReachMapShareSource._data_text(placemark, "Time UTC")
        if time_utc is not None:
            return InReachMapShareSource._parse_iso(time_utc)

        name = placemark.find("{http://www.opengis.net/kml/2.2}name")
        if name is not None and name.text:
            return InReachMapShareSource._parse_iso(name.text)
        return None

    @staticmethod
    def _data_text(placemark: Element, name: str) -> Optional[str]:
        for data in placemark.iter("{http://www.opengis.net/kml/2.2}Data"):
            if data.get("name") == name:
                value = data.find("{http://www.opengis.net/kml/2.2}value")
                if value is not None and value.text:
                    return value.text
        return None

    @staticmethod
    def _leading_number(text: str) -> tuple[Optional[float], str]:
        """The number a value starts with, and the lower-cased text after it (its unit)."""
        match = _LEADING_NUMBER.match(text)
        if match is None:
            return None, ""
        return float(match.group(1)), text[match.end():].strip().lower()

    @staticmethod
    def _extract_heading_deg(placemark: Element) -> Optional[float]:
        text = InReachMapShareSource._data_text(placemark, "Course")
        if text is None:
            return None
        degrees, _ = InReachMapShareSource._leading_number(text)
        if degrees is None or not 0 <= degrees <= 360:
            return None
        return degrees

    @staticmethod
    def _extract_speed_ms(placemark: Element) -> Optional[float]:
        text = InReachMapShareSource._data_text(placemark, "Velocity")
        if text is None:
            return None
        kilometres_per_hour, unit = InReachMapShareSource._leading_number(text)
        if kilometres_per_hour is None or kilometres_per_hour < 0:
            return None
        if unit and not unit.startswith("km/h"):
            return None
        return kilometres_per_hour * _KILOMETRES_PER_HOUR_TO_METRES_PER_SECOND

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
    def _extract_coordinates(placemark: Element) -> Optional[tuple[float, float]]:
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
