from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime
from typing import ClassVar, Optional

from Services.SatelliteFeeds.types import NormalizedPosition, SatelliteProvider


class SatelliteFeedError(Exception):
    """Base class for the three failure modes a poll can hit. Caught per-feed by the
    beat task, the same isolate-and-continue shape as checkpoint_beat_task.py — one
    paddler's expired feed URL must never stop the batch."""


class FeedAuthError(SatelliteFeedError):
    """Feed URL rejected the stored credentials (401/403), or a provider that issues
    time-limited share links has expired. Distinct from FeedUnavailableError because
    the fix is "re-enter your feed URL/credentials," not "try again later.\""""


class FeedUnavailableError(SatelliteFeedError):
    """Transient — timeout, 5xx, DNS failure. Same shape as TileService's
    `upstream_unavailable`: worth a warning log, not worth alerting the user on a
    single occurrence."""


class FeedParseError(SatelliteFeedError):
    """The response came back 200 but isn't shaped the way this parser expects — a
    provider changed their KML/JSON schema, or the feed has zero points in the window
    polled (which may be legitimate — device asleep — so callers should not treat an
    empty *successful* parse as this error; only a genuinely malformed body is)."""


@dataclass(frozen=True)
class PreparedFeedRequest:
    url: str
    headers: dict[str, str]
    timeout_seconds: int = 10  # matches TileService.REQUEST_TIMEOUT_SECONDS


class SatelliteFeedSource(ABC):
    """One subclass per provider (`SatelliteProvider`). Instances are stateless and
    safe to reuse across polls — all per-feed state (URL, credentials, last-seen
    timestamp) is passed in as arguments, never held on `self`, so one instance can
    serve every registered feed for that provider in a single beat-task run."""

    provider: ClassVar[SatelliteProvider]

    @abstractmethod
    def build_request(
        self,
        feed_url: str,
        credentials: Optional[dict[str, str]],
        since: Optional[datetime],
    ) -> PreparedFeedRequest:
        """Construct the outbound HTTP request for this provider: final URL (with any
        query params a time-windowed poll needs), headers, and a request timeout.
        Does not perform the request — the beat task owns the actual `requests.get()`
        call, mirroring `TileService._fetch_upstream`'s pattern of a thin,
        single-purpose fetch function the caller wraps in its own error handling.
        """

    @abstractmethod
    def parse(self, raw: bytes, since: Optional[datetime]) -> list[NormalizedPosition]:
        """Parse a raw response body into normalized positions, oldest-first. Must
        silently skip points at or before `since` rather than erroring, since a
        provider's own server-side time filter is not always exact at the boundary.
        Raises FeedParseError only when the body cannot be understood at all, not
        when it parses cleanly to zero new points.
        """
