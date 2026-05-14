# ADR-021: Expedition log auto-generation — Celery dual-trigger model

**Status**: accepted
**Date**: 2026-05-11

## Context

Paddling logs are only useful if they exist. Requiring users to manually create a log
entry at the end of each expedition day — after hours on the water, setting up camp, and
making dinner — means logs will be missed or filled in retrospectively with degraded
accuracy.

The system already collects the data needed to construct a meaningful log automatically:
real-time GPS positions are broadcast during a live expedition (M8), and weather/sea
conditions are fetched per-day per-location (M5). The question is whether the system
should use this data to auto-generate logs, and how to trigger generation reliably.

## Decision

**Auto-generation via Celery:**  
At the end of each expedition day, a Celery task generates a `Log` record automatically.
The task computes:

- **Mileage**: sum of haversine distances between sequential GPS position pings recorded
  for that member on that day. If GPS data is sparse (< 3 pings, or gaps > 2 hours),
  the calculation falls back to the sum of inter-point distances in the recorded
  itinerary for the day. If neither is available, `mileage = null` and the user is
  prompted to enter it manually.
- **Duration**: timestamp of first ping to timestamp of last ping for the day.
- **Conditions snapshot**: sea state, wind speed/direction, and temperature from the
  weather/sea record already stored for that day and location (M5 data).
- **Route snapshot**: ordered list of GPS position pings for the day, stored as a
  GeoJSON LineString on the log record.

The user then fills in optional narrative fields: free-text notes (logbook), difficulty
rating (1–5), mood/energy rating (1–5), and notable highlights (short text). These
fields are intentionally left optional — the auto-generated record has standalone value
without them, and optional fields have higher completion rates than mandatory ones.
Difficulty and mood ratings enable downstream analysis (personal stats, trip debriefs).

**Dual-trigger model:**  
Generation uses two triggers to maximise reliability:

1. **Manual trigger (primary):** the trip leader explicitly closes the day in the live
   expedition view. This immediately enqueues the Celery task for all members on the
   trip.
2. **Scheduled fallback (secondary):** a Celery Beat task runs nightly (00:30 UTC) and
   checks all trips in `happening` state. For any day that has ended (based on trip
   timezone) but has no log record, it enqueues the generation task.

The scheduled fallback handles: leader forgetting to close the day, app crash, network
failure during manual trigger. It does not overwrite a log that already exists.

**Timezone handling:**  
All timestamps are stored in UTC. The "day boundary" for fallback triggering is computed
using the trip's geographic region timezone (derived from the expedition start/end
coordinates via `timezonefinder` at trip creation time, stored on `Trip` as
`timezone_name`). Display in the frontend always converts UTC → local timezone.

**Minimum viable log:**  
If no GPS data and no itinerary data exist for a day, the task creates a stub log record
with `mileage = null`, `duration = null`, and a `source = "manual"` flag. The user sees
a notification in the Logs page prompting them to fill in the mileage manually. A log
record with no mileage is still a valid logbook entry — it captures conditions and any
notes the user adds.

## Consequences

**Positive**
- Log coverage is high without requiring user discipline; the data already exists.
- Mood/difficulty fields enable personal analytics (average paddling difficulty per
  season, energy patterns across multi-day trips) without being mandatory.
- Dual-trigger is resilient to the manual trigger failing in field conditions (poor
  connectivity, battery death, forgotten step).
- UTC + timezone-aware display is consistent with how all other date fields are handled
  across the system.

**Negative / trade-offs**
- `timezone_name` field must be added to `Trip` and populated at creation time. If the
  trip location changes after creation, the timezone may be stale — acceptable for the
  MVP.
- The `timezonefinder` library adds a dependency and a one-time startup cost (loads a
  ~22 MB timezone database). Use a lazy singleton.
- Celery Beat requires the Beat scheduler to be running as a separate process in
  production. This is already a requirement from M2 (weather fetching) so adds no new
  infrastructure burden.
- GPS-based mileage is only as accurate as the ping frequency. If a user's device
  goes offline for hours (common at sea), straight-line interpolation will
  underestimate real distance. Document this as a known limitation; do not compensate
  with heuristics.

**Risks / open questions**
- Privacy: GPS tracks on log records are personal data. Apply the same GDPR erasure
  rules as other user data (cascade delete on account deletion, anonymise on trip
  archival if leader is deleted — per ADR-013).
- Multi-day trips with no GPS at all (pre-M8 trips, or trips where the live feature
  was not used): the fallback produces stub logs. Consider whether to suppress log
  generation entirely for trips that have no GPS data rather than creating empty stubs.
  Decision deferred to M8 scoping.
