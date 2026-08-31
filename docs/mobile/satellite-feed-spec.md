# `SatelliteFeedSource` parser interface — design spec

> M9a WP3. Feeds `plans/M9.md` M9f (Tier 2 — server-side satellite feed polling). Produced
> alongside WP2 (tile UX), WP4 (Play Store checklist), WP5 (mobile scaffold) as an independent
> M9a work package; reconciled into `docs/adr/mobile-offline.md` by WP6 once WP1's schema lands.
> This file is **not** an edit to `mobile-offline.md` — WP2 is editing that file concurrently.
>
> Scope per `mobile-offline.md`'s "External GPS device integration" section and its "Unresolved
> before M9 starts" item 5: define the device-agnostic parser interface before any
> provider-specific parser is implemented, and do the same format research for SPOT/Zoleo/Bivy
> Stick that was already done for Garmin. **No parser implementation. No Celery task
> implementation.** Interface + research only.

---

## 1. Recap of what's already decided (not re-litigated here)

- Backend-only. A Celery beat task polls a user-registered feed URL at intervals and ingests
  positions through the pipeline M8 already built. The phone is not involved — this works even
  with the phone off, in a dry bag, or out of Bluetooth range.
- The backend is agnostic to source: any ingested position is `{ lat, lng, timestamp, user_id,
  source }`, indistinguishable from a phone GPS ping or a Tier-1 BLE/NMEA source once ingested.
- Garmin inReach MapShare is the first target: no API account, user-provided feed URL, KML
  response. SPOT, Zoleo, and Bivy Stick are the other three named providers.
- Do **not** build a Garmin-only solution — the interface must accommodate KML, JSON, and
  proprietary formats, and per-provider auth (none, feed-ID, or feed-ID + password) from day one.
- Feed URL credentials, where a provider requires them, are stored encrypted on the user profile.

---

## 2. Interface design

### 2.1 Why an ABC here, when the rest of `backend/Services/` uses plain static-method classes

Every existing service in `backend/Services/` (`TileService`, `LivePositionService`, etc.) is a
single, non-polymorphic class of `@staticmethod`s — there's only ever one `TileService`. This is
the first place in the backend that actually needs **one interface, many interchangeable
implementations selected at runtime by a stored value** (`SatelliteFeed.provider`) — precisely
the shape `abc.ABC` exists for, and precisely what `mobile-offline.md`'s "abstraction requirement"
paragraph is asking for. It is a deliberate, narrow departure from house style for a case the
existing style doesn't cover, not a signal to start using ABCs generally.

### 2.2 Normalized output shape

```python
# Services/SatelliteFeeds/types.py

from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from typing import Any, Optional


class SatelliteProvider(str, Enum):
    """Value stored in SatelliteFeed.provider and echoed as PositionPing.source —
    matches the string M8's ingest pipeline already expects in `source`."""

    INREACH_MAPSHARE = "inreach_mapshare"
    SPOT = "spot"
    ZOLEO = "zoleo"
    BIVY_STICK = "bivy_stick"


@dataclass(frozen=True)
class NormalizedPosition:
    """The one shape every provider parser must produce. Matches the task's required
    output `{ lat, lng, timestamp, source, raw? }` — `raw` is optional and kept only
    for debugging/audit, never persisted verbatim onto PositionPing."""

    lat: float
    lng: float
    timestamp: datetime  # tz-aware, UTC
    source: SatelliteProvider
    raw: Optional[dict[str, Any]] = None  # the provider's own per-point payload, pre-normalization
```

Two things worth calling out about this shape:

- **`timestamp` must be tz-aware UTC on the way out of every parser**, even though providers
  disagree on how they hand it in (Garmin: UTC name/`Time UTC` fields already ISO 8601; SPOT:
  `unixTime` *and* a separate `dateTime` with its own offset; Zoleo/Bivy: unconfirmed, see §3).
  Normalizing timezone handling is parser work, not ingest work — `LivePositionService.record_ping`
  should not need to know which provider a ping came from.
- **`raw` is deliberately optional and separate from the normalized fields**, not a merge. It
  exists for the same reason `checkpoint_beat_task.py` logs `extra={"trip_id": ...}` rather than a
  formatted string — if a provider's parser needs to change later (a field renamed upstream, a new
  event type), having the untouched original payload alongside the normalized one make triage
  possible without replaying the poll.

### 2.3 Fetch/parse split and the interface itself

A satellite feed poll is two separable concerns that should not be forced into one method:
**fetching** (HTTP request shape — URL, auth, and for KML feeds the `d1`/`d2` time-window query
params so a 10-minute poll doesn't re-fetch a week of history) and **parsing** (turning whatever
came back into `NormalizedPosition` rows). Keeping them separate means a future test can feed a
captured KML/XML fixture straight into `parse()` without a live HTTP call, matching how this
codebase already tests services against fixtures rather than live upstreams elsewhere.

```python
# Services/SatelliteFeeds/base.py

from abc import ABC, abstractmethod
from datetime import datetime
from typing import ClassVar, Optional

from Services.SatelliteFeeds.types import NormalizedPosition, SatelliteProvider


class SatelliteFeedError(Exception):
    """Base class for the three failure modes a poll can hit. Caught per-feed by the
    beat task, the same isolate-and-continue shape as checkpoint_beat_task.py — one
    paddler's expired feed URL must never stop the batch."""


class FeedAuthError(SatelliteFeedError):
    """Feed URL rejected the stored credentials (401/403), or a provider that issues
    time-limited share links (Zoleo's shared activity link, Bivy's 7-day location-share
    link — see §3) has expired. Distinct from FeedUnavailableError because the fix is
    "re-enter your feed URL/credentials," not "try again later.\""""


class FeedUnavailableError(SatelliteFeedError):
    """Transient — timeout, 5xx, DNS failure. Same shape as TileService's
    `upstream_unavailable`: worth a warning log, not worth alerting the user on a
    single occurrence."""


class FeedParseError(SatelliteFeedError):
    """The response came back 200 but isn't shaped the way this parser expects — a
    provider changed their KML/JSON schema, or the feed has zero points in the window
    polled (which may be legitimate — device asleep — so callers should not treat an
    empty *successful* parse as this error; only a genuinely malformed body is)."""


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
    ) -> "PreparedFeedRequest":
        """Construct the outbound HTTP request for this provider: final URL (with any
        query params a time-windowed poll needs — Garmin's `d1`/`d2`, SPOT's
        `startDate`/`endDate`), headers (HTTP basic auth for Garmin, `feedPassword`
        query param for SPOT, whatever Zoleo's confirmed mechanism turns out to be —
        see §3), and a request timeout. Does not perform the request — `SatelliteFeedPoller`
        (below) owns the actual `requests.get()` call, mirroring
        `TileService._fetch_upstream`'s pattern of a thin, single-purpose fetch
        function the caller wraps in its own error handling / suppressed tracing span.
        """

    @abstractmethod
    def parse(self, raw: bytes, since: Optional[datetime]) -> list[NormalizedPosition]:
        """Parse a raw response body (KML bytes, XML bytes, JSON bytes — whatever this
        provider returns) into normalized positions, oldest-first. Must silently skip
        points at or before `since` rather than erroring, since a provider's own
        server-side time filter (Garmin `d1`/`d2`, SPOT `startDate`) is not always
        exact at the boundary. Raises `FeedParseError` only when the body cannot be
        understood at all, not when it parses cleanly to zero new points.
        """


@dataclass(frozen=True)
class PreparedFeedRequest:
    url: str
    headers: dict[str, str]
    timeout_seconds: int = 10  # matches TileService.REQUEST_TIMEOUT_SECONDS
```

### 2.4 Registry — same shape as `tile_service.py`'s `_LAYER_UPSTREAM`

```python
# Services/SatelliteFeeds/registry.py

from Services.SatelliteFeeds.base import SatelliteFeedSource
from Services.SatelliteFeeds.types import SatelliteProvider
from Services.SatelliteFeeds.providers.inreach_mapshare import InReachMapShareSource
# from Services.SatelliteFeeds.providers.spot import SpotSource            (M9f)
# from Services.SatelliteFeeds.providers.zoleo import ZoleoSource          (M9f, pending §3.3)
# from Services.SatelliteFeeds.providers.bivy_stick import BivyStickSource (M9f, pending §3.4)

_SOURCES: dict[SatelliteProvider, SatelliteFeedSource] = {
    SatelliteProvider.INREACH_MAPSHARE: InReachMapShareSource(),
}


def get_source(provider: SatelliteProvider) -> SatelliteFeedSource:
    try:
        return _SOURCES[provider]
    except KeyError:
        raise ValueError("unsupported_provider")
```

This is the same registry-dict shape `tile_service.py` uses for its two tile layers
(`_LAYER_UPSTREAM`) — a plain module-level dict, no factory class, no dependency injection
framework. Adding a provider is adding one dict entry once its `SatelliteFeedSource` subclass
exists, which is exactly how a third tile layer would be added today.

### 2.5 Orchestration sketch (not implemented — for shape only)

The eventual beat task (M9f, not this work package) polls every enabled `SatelliteFeed` row,
looks up its source via `get_source(feed.provider)`, and does the fetch/parse/ingest/error-isolate
loop in the same per-item try/except-and-continue shape `checkpoint_beat_task.py` already
establishes:

```python
for feed in enabled_feeds:
    source = get_source(feed.provider)
    try:
        request = source.build_request(feed.feed_url, feed.decrypted_credentials(), feed.last_polled_at)
        raw = _fetch(request)  # thin requests.get() wrapper, TileService._fetch_upstream-style
        positions = source.parse(raw, feed.last_polled_at)
        for pos in positions:
            LivePositionService.record_ping(feed.trip_id, feed.user_id, {
                "lat": pos.lat, "lon": pos.lng, "recorded_at": pos.timestamp,
            })
        feed.last_polled_at = now
        db.session.commit()
    except FeedAuthError:
        # mark feed needs_reauth, notify user — credentials/link expired
        ...
    except (FeedUnavailableError, FeedParseError):
        logger.warning("satellite_feed_poll_failed", extra={"feed_id": str(feed.id), "provider": feed.provider.value})
        db.session.rollback()
```

Two things this sketch surfaces that M9f will need to resolve and are **out of scope here**:
`LivePositionService.record_ping` currently raises `ValueError("trip_not_live")` unless
`Trip.state == HAPPENING` — correct for a phone ping, but a satellite feed may arrive slightly
before or after that window and arguably should still be recorded; and there is no
`SatelliteFeed` model yet (provider, feed_url, encrypted credentials, `last_polled_at`,
`trip_id`/`user_id`, `needs_reauth` flag) — that belongs to M9f's own design pass, not this one,
though the parser interface above was written to imply exactly those columns.

### 2.6 Credential storage — flagged, not designed here

`mobile-offline.md` requires feed credentials stored encrypted on the user profile. The existing
`Services/crypto_service.py` is **not** the right tool as-is: it implements two E2E schemes
(password-derived AES-GCM for medical notes, X25519 ECIES for leader-decrypt) where the point is
that *the server cannot decrypt without a secret only the user holds*. A satellite-feed credential
is the opposite requirement — **the server must decrypt it unattended**, on every beat-task poll,
with no user present to supply a password. That needs a plain server-side-key-encrypted-at-rest
scheme (an application secret, e.g. `AESGCM` keyed from an env var such as `JWT_SECRET_KEY`'s
sibling, not a user-derived key) — a new, smaller utility, not a reuse of `crypto_service.py`'s
existing functions. Flagging this now because it is a real gap the interface above assumes is
solved (`feed.decrypted_credentials()`); designing it is M9f work.

---

## 3. Per-provider research

Researched live (WebSearch/WebFetch, 2026-08-26), not from training-data memory, per the task's
instruction. Confidence and sourcing noted per provider — two of the four (Zoleo, Bivy Stick) do
not have confirmable self-service public documentation, and that gap is itself a finding.

### 3.1 Garmin inReach MapShare — HIGH confidence

| | |
|---|---|
| **Format** | KML (XML). One `<Placemark>` per position report. |
| **Auth** | None required for a public MapShare feed; HTTP Basic Auth (username/password) if the user has set MapShare's optional password protection. Always over HTTPS. |
| **Feed URL shape** | `https://share.garmin.com/Feed/Share/<mapShareId>` (regional variants exist, e.g. `https://aus.explore.garmin.com/Feed/Share/<id>`). User obtains this from their own MapShare settings — no API account. |
| **Time-window query** | `?d1=<ISO8601 UTC>&d2=<ISO8601 UTC>` — e.g. `...?d1=2012-10-16T06:19z&d2=2012-10-18T23:59z`. **Without `d1`/`d2` the feed returns only the single most recent point**, so a beat task doing incremental polling must always pass `d1=<last_polled_at>` or it will only ever see the latest ping, not everything since the last poll. |
| **Fields per point** | Coordinates (WGS84, lat/lng from `<coordinates>`); timestamp as the placemark `<name>` (ISO 8601 UTC) plus `ExtendedData` fields "Time UTC" and "Time" (local); elevation (meters, MSL); course (true degrees); velocity (km/h); device IMEI; user/display name; device type; incident ID; GPS fix validity; emergency/SOS state; free-text message (Unicode). **No battery-level field documented.** |
| **Polling interval** | No documented hard rate limit. Garmin's own docs describe the feed as "designed to be polled for new point information at a frequency desired by the consumer" — no server push. `mobile-offline.md` already assumes ~10 minutes (typical inReach tracking interval), which is a reasonable default in the absence of a stated cap; worth a courtesy delay/backoff on repeated failures regardless. |
| **Gotchas** | Message types disabled for viewing in the user's own MapShare display settings are also absent from the KML feed — a paddler who's hidden text messages from their share page won't have them in the feed either, which is fine for our purposes (we only want position). The default single-latest-point behavior above is the one easy-to-miss trap for a naive implementation. |

Sources: [inReach KML Feed Documentation (community wiki)](https://github.com/BHSPitMonkey/homeassistant-garmin-mapshare/wiki/inReach-KML-Feed-Documentation), [Mapshare KML feeds — Garmin Forums](https://forums.garmin.com/outdoor-recreation/outdoor-recreation-archive/f/inreach-general/340021/mapshare-kml-feeds).

### 3.2 SPOT — HIGH confidence

| | |
|---|---|
| **Format** | XML or JSON — same data, selected by file extension on the request (`.xml` vs `.json`). |
| **Auth** | No API key/account. Requires the **Feed ID** (`glId`), obtained from the user's own Shared Page URL — self-service, same trust model as Garmin. Optional `?feedPassword=<password>` query param if the user has password-protected their shared page. |
| **Feed URL shape** | `https://api.findmespot.com/spot-main-web/consumer/rest-api/2.0/public/feed/<FEED_ID>/message.xml` (or `.json`); `/latest.xml` variant returns only the newest message per device. |
| **Time-window / paging** | `?startDate=<ISO8601 with offset>&endDate=<ISO8601 with offset>` for date filtering; `?start=51`, `?start=101`, … for paging in increments of 50 (default page is the most recent 50 messages). |
| **Fields per point** | `id`, `messengerId`, `messengerName`, `latitude`, `longitude`, `unixTime` (epoch seconds) **and** `dateTime` (ISO with its own offset — two representations of the same instant, worth picking one consistently, `unixTime` is simplest to normalize), `messageType` (`OK`, `TRACK`, `HELP`, `CUSTOM`, etc. — `HELP` is worth treating specially at ingest time even though SOS itself bypasses the app per the ADR), `modelId`, `messageContent`. **No battery-level field documented**, same gap as Garmin. |
| **Polling interval** | No documented rate limit found. **Hard retention ceiling: the feed only returns data from the point the feed was created, up to a maximum of 7 days** — `startDate`/`endDate` filtering cannot reach further back than that regardless of the range requested. This matters less for a live 10-minute poll (we're always asking for "since last poll," well inside 7 days) but matters a lot if a feed goes unpolled for a week (a paddler's phone lost, or our beat task down) — anything older than 7 days is unrecoverable from SPOT's side, not just from a lag on our end. |
| **Gotchas** | The 7-day ceiling above is the standout risk versus Garmin, which has no documented retention limit on the feed itself (MapShare's own display window is separately configurable by the user, but the KML feed endpoint isn't documented as capped the same way). Worth alerting a user whose feed hasn't been reachable for several days, before the 7-day SPOT ceiling is reached, once this is implemented. |

Sources: [Public API and XML Feed — SPOT](https://www.findmespot.com/en-us/support/spot-gen4/get-help/general/public-api-and-xml-feed) (title confirmed via search; page itself is proxy-blocked from this environment — content triangulated from the SPOT API description mirrored in [glidernet/ogn-aprs-protocol's `SPOT API.txt`](https://github.com/glidernet/ogn-aprs-protocol/blob/master/SPOT%20API.txt), which is a third-party transcription of the same official spec, not the primary source).

### 3.3 Zoleo — LOW confidence, real open question

This is the one provider where research did **not** land on a confirmable answer, and that
uncertainty is itself the finding to carry into M9f.

What was found:

- ZOLEO has a developer platform (`developers.zoleo.com`) offering a RESTful API — "send
  messages, retrieve location data, manage devices" — but this reads as an **account/partner API**
  (register, get credentials), not a public no-account feed URL like Garmin's or SPOT's. Could not
  confirm its auth model (API key vs OAuth) or response format directly — the site itself and
  ZOLEO's own support KB (`support.zoleo.com`) were both unreachable from this environment
  (network egress proxy blocks both domains).
- Third-party evidence (a SpotWalla setup guide, itself found via search rather than fetched
  directly) describes an **older mechanism**: logging into a MyZOLEO account, finding an "XML
  Feed" section, and generating a "Raw KML Data" link plus an optional feed password — structurally
  identical to Garmin's model. If still live, this is exactly the self-service shape our interface
  needs.
- Separately, ZOLEO's current **"Data Sharing"** flow (per search results describing the MyZOLEO
  portal's "My Data Sharing" tab) requires selecting a partner from a **"ZOLEO's Partners"
  dropdown** and authorizing consent — implying that receiving ZOLEO location data today may
  require *our app to be an approved ZOLEO partner*, not something a user can self-service by
  pasting a URL. A community forum post (title: "Live Tracking through Caltopo") was found
  discussing exactly this gap but could not be fetched (same blocked domain).
- ZOLEO's own device/app documentation confirms a separate, user-facing **"shared activity
  link"** feature (ZOLEO Track): a read-only web view, no login required for the viewer, default
  expiry the next day, configurable up to 180 days ahead. This is almost certainly *not* a
  machine-parseable feed (it's a rendered web page for a human), but is worth a second look before
  ruling it out — some providers' "human" share pages carry an underlying JSON endpoint the page's
  own JS calls, undiscoverable without loading the page in a real browser, which this research
  method cannot do.
- Confirmed field-level detail (secondhand, from a ZOLEO marketing/support page fragment):
  ZOLEO position updates carry speed (km/h), altitude (meters), and battery percentage — notably,
  if this is accurate, Zoleo may be the only one of the four providers exposing battery in its
  feed data, which the ADR calls out as a useful safety signal.

**Open question for M9f, not resolved here**: whether Zoleo integration is (a) a self-service
Raw-KML-feed-plus-password, matching our interface's `build_request`/`parse` split cleanly, or
(b) a partner-application process gating access to the real-time API, which would need a business
development step before any code — a materially different scope and timeline than Garmin/SPOT.
Resolving this needs either a real MyZOLEO account to test the "XML Feed" section directly, or a
support ticket to ZOLEO asking whether that self-service mechanism is still live in 2026 — neither
of which this research task could do from here.

Sources (search-result summaries; primary ZOLEO domains were unreachable — network egress proxy
blocked `support.zoleo.com` and `developers.zoleo.com` for this session):
[ZOLEO Developer Platform](https://developers.zoleo.com/),
[Message Data Feed Overview – ZOLEO](https://support.zoleo.com/hc/en-us/articles/25267525338903-Message-Data-Feed-Overview),
[Live Tracking through Caltopo – ZOLEO community](https://support.zoleo.com/hc/en-us/community/posts/5179832640407-Live-Tracking-through-Caltopo),
[ZOLEO Track FAQ](https://support.zoleo.com/hc/en-us/articles/42175074508692-ZOLEO-Track-FAQ),
[Help: Devices – SpotWalla](https://new.spotwalla.com/help/devices) (describes the Raw KML Feed
setup steps for Zoleo; page itself unreachable, content from search-result summary only).

### 3.4 Bivy Stick — LOW confidence, real open question

Also could not confirm a self-service public feed format. `bivystick.com`, `www.bivy.com`, and
`support.satellitephonestore.com` were all unreachable (blocked) from this environment.

What was found:

- Bivy publishes a REST API described only in marketing-page terms ("scalable," "flexible,"
  "works for any business") — no confirmed endpoint list, auth mechanism, or response format
  reached from search results alone. `bivystick.com/api/` (the presumed docs entry point) is
  blocked and could not be fetched.
- Location sharing from the device produces a **private web link** (`bivy.com/...`) sent as part
  of the device's message — described as viewable by "only those who have that link." **The link
  expires after 7 days.** This is a real, confirmed gotcha regardless of format: even if the link
  underneath is a pollable feed rather than a rendered page, a 7-day expiry means credentials
  would need periodic re-registration by the user, unlike Garmin's durable feed URL.
  Zoleo's "shared activity link" pattern (§3.3) is structurally similar — providers built more
  recently than Garmin/SPOT appear to favor time-boxed share links over durable feed URLs, which
  is a pattern worth expecting from *future* providers too, not just these two.
- No field-level detail (lat/lng/timestamp/battery naming) could be confirmed — user guide PDFs
  and API docs were either blocked or did not surface in fetchable search snippets.

**Open question for M9f, not resolved here**: whether the location-share link is itself
machine-readable (a JSON/KML endpoint behind the human-facing page) or purely a rendered web page
requiring an HTML-scraping approach we should avoid building against (fragile, likely against
terms of service). Needs either a real Bivy Stick device/account to test directly, or a fetch from
an unblocked network — this research session's proxy restrictions were the limiting factor, not
absence of a public feed.

Sources: [ACR Bivy Stick FAQ](https://support.satellitephonestore.com/hc/en-us/articles/4665887890836-ACR-Bivy-Stick-FAQ)
(title/snippet only, page blocked), [Bivy Stick User Guide PDF](https://www.acrartex.com/wp-content/uploads/2024/04/ACR_Bivy_Stick_UserGuide.pdf)
(not fetched — surfaced by search, worth a follow-up fetch from an unrestricted environment),
[API | ACR Bivy Stick](https://bivystick.com/api/) (blocked).

### 3.5 Cross-provider summary

| Provider | Format | Self-service auth | Retention/expiry gotcha | Battery field | Confidence |
|---|---|---|---|---|---|
| Garmin inReach MapShare | KML | None, or Basic Auth if user sets a MapShare password | None documented | No | High |
| SPOT | XML or JSON | None beyond Feed ID; optional `feedPassword` | **7-day hard ceiling** on the feed itself | No | High |
| Zoleo | Unconfirmed — possibly KML via a legacy "XML Feed," possibly partner-API-only | Unconfirmed | Possible link-based expiry (activity-share link: next-day default, up to 180 days) | Possibly yes (unconfirmed) | **Low — needs a real account or unblocked fetch to resolve** |
| Bivy Stick | Unconfirmed | Unconfirmed | **Location-share link expires after 7 days** (confirmed) | Unconfirmed | **Low — needs a real account or unblocked fetch to resolve** |

The practical read: **build the interface (§2) so Garmin ships first**, since it's the only
provider with a fully confirmed, purely self-service, durable-URL model — which also matches
`mobile-offline.md`'s own sequencing ("Garmin inReach specifics" gets a whole paragraph; SPOT/
Zoleo/Bivy get one sentence each). SPOT is very likely straightforward to add second (same shape
as Garmin, with the 7-day retention caveat worth surfacing to the user proactively rather than
discovering it silently). Zoleo and Bivy Stick each carry a real open question that blocks
committing to a build estimate for either until someone with an actual account (or unrestricted
network access) confirms the mechanism — this should be flagged to whoever scopes M9f's timeline,
not silently assumed to be "the same shape, minus the research."

---

## 4. Summary for WP6 reconciliation

- Interface (§2) is provider-agnostic, fetch/parse-split, matches `mobile-offline.md`'s stated
  abstraction requirement, and follows this codebase's existing `tile_service.py` registry-dict
  convention where the two diverge from plain static-method services (justified in §2.1).
- Two gaps surfaced that are **not** this work package's to close, flagged for M9f: the
  `SatelliteFeed` model itself (§2.5) and the at-rest credential encryption utility (§2.6) — the
  interface's method signatures assume both exist but neither is designed here.
- Confidence is high for Garmin and SPOT, low for Zoleo and Bivy Stick — both need direct account
  access or an unblocked network to resolve before implementation estimates for those two should
  be trusted.
