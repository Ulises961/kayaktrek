---
id: features
title: "Features: Weather & Sea Data, Tidal Model, Expedition Log, Map Annotations & Inventory"
abstract: OpenMeteo for weather/swell, manual tidal entry with rule-of-12s (automation deferred), TidalStation stream tables and chart-diamond overlays, Celery dual-trigger expedition log auto-generation, map annotations as standalone Place entities (replacing Point.interest), and a two-tier personal-gear / trip-requirement inventory model.
implementation: shipped
status: accepted
date: 2026-06-10
deciders: []
tags: [weather, tidal, expedition-log, map, places, inventory]
---

# Features: Weather & Sea Data, Tidal Model, Expedition Log, Map Annotations & Inventory

This document covers the concrete product features whose design required substantial decisions: how weather, sea, and tidal data is sourced, modelled, and displayed (M5); how expedition logs are auto-generated at the close of each paddling day (M8); how map annotations (POIs) are modelled as standalone `Place` entities rather than route points (M4e); and how personal gear and trip gear requirements are kept as two separable concerns (M6).

---

## Weather & Sea Data

### Three distinct data concerns

M5 adds per-day weather and sea conditions to the itinerary. Three concerns require separate treatment:

1. **Weather and sea swell** (temperature, wind, wave height, swell period): freely available via OpenMeteo's global APIs — no paid dependency.
2. **Tidal heights** (high/low tide times and range): necessary for the rule of 12s and water-depth estimation. No free global automated source with the precision needed; manual entry is the correct first-class path.
3. **Tidal streams** at specific passages (tidal races, channels, headlands): hydrographic data published by national authorities (UKHO, NOAA, SHOM, BSH). Not available through any weather API. Published atlas data is the ground truth used by professional kayakers.

---

### 1. Weather and sea swell — OpenMeteo

**OpenMeteo Marine API** (`marine-api.open-meteo.com/v1/marine`): hourly wave height, direction, period; swell wave height/direction/period (wind swell vs primary swell separated); hourly ocean current speed and direction.

**OpenMeteo Forecast API** (`api.open-meteo.com/v1/forecast`): hourly temperature, precipitation, wind speed, wind direction, cloud cover.

Both endpoints are fetched in a single Celery task per itinerary day, triggered after `apply-boundaries` sets dates on days. Responses are cached in Redis DB 1 via Flask-Caching with a 6-hour TTL (conditions change slowly at day-planning granularity). The `Weather` + `WeatherState` and `Sea` + `SeaState` models already exist and map directly to these feeds.

**Why OpenMeteo cannot drive tidal calculations**: OpenMeteo's marine API provides `ocean_current_velocity` / `ocean_current_direction` from a global circulation model (CMEMS/GFS). These are current speed in knots — not tidal heights in metres. The rule of 12s needs HW/LW times and a height range; neither exists in OpenMeteo's output. The current vectors mix tidal, wind-driven, and geostrophic components at 5–25 km grid resolution — far too coarse and mixed to recover reliable HW times at the scale of a tidal passage. OpenMeteo current vectors are stored in `SeaState` but are not exposed as a map layer — they risk misleading paddlers in complex tidal environments.

---

### 2. Tidal heights — manual operability first, automation deferred

**The M5 decision**: manual entry by the trip leader is the primary path. Automated tidal prediction is non-trivial infrastructure (national API keys, a `TidalPort` reference table, ~30 GB model files for global harmonic grid fallback) that may not land until well after M5. Building the manual path comprehensively first means the feature is immediately useful to any leader with a pilot book or local knowledge. When automation arrives it slots into the same `Sea` fields and the same precedence chain — no UI or schema rework needed.

**`Sea` fields for full manual operability** (M5 migration):

| Field | Type | Notes |
|-------|------|-------|
| `high_tide` | TIME | HW time at the planned location |
| `low_tide` | TIME | LW time |
| `tidal_range_m` | NUMERIC | Height difference HW to LW in metres |
| `reference_port_name` | VARCHAR NULL | Named port or passage the leader is referencing (e.g. "Milford Haven", "Ramsey Sound north entrance") |
| `hw_time_offset_minutes` | INTEGER NULL | Signed correction applied to reference port's HW time to reach actual location. Null means `high_tide` is already corrected. |
| `lw_time_offset_minutes` | INTEGER NULL | Same for LW |
| `hw_height_ratio` | NUMERIC NULL | Height correction factor for HW |
| `lw_height_ratio` | NUMERIC NULL | Height correction factor for LW |
| `tidal_source` | VARCHAR | Provenance: `"manual"`, `"manual_corrected"`, or (future) `"predicted_standard:<port>"`, `"predicted_secondary:<port>"`, `"predicted_grid"` |

Any field the leader has set is never overwritten by automation. `tidal_source` signals which fields are safe for the automated pipeline to populate.

**UI progressive disclosure in the detail panel**:
- **Quick entry** (most common): leader types HW time, LW time, range directly. `tidal_source = "manual"`.
- **Port-referenced entry** (leader has a tide table): leader names the reference port, enters HW/LW from the table, optionally adds time and height corrections. App derives the adjusted HW/LW/range and shows them. `tidal_source = "manual_corrected"`.
- Entered fields are visually distinguished from computed or empty fields. Derived values are shown as editable — the leader can always override the final output directly.

**Automated prediction pipeline** (deferred, architecture decided):

The pipeline follows the standard port / secondary port model used by all published almanacs. When it lands:

1. A `TidalPort` reference table stores standard and secondary ports with their published time and height correction offsets, seeded from national authority open data.
2. PostGIS `ST_Distance` finds the nearest port to the day's bounding box centroid. Secondary port corrections account for coastal propagation offsets.
3. Source priority by region:
   - NOAA CO-OPS (US bounding box)
   - SHOM (France)
   - SMHI (Sweden), MET Norway, DMI (Denmark), Waterinfo.be (Belgium)
   - Global harmonic grid fallback: FES2022/EOT20 via `pyTMD` (~30 GB server-hosted model files) for all other regions including UK waters (UKHO charges for tidal prediction API access)
4. The pipeline populates only fields the leader has not manually set. `tidal_source` is updated to reflect the API and port chain used. Reference port name, distance from route centroid, and any correction applied are stored on `Sea` and surfaced in the UI.

---

### 3. Tidal stream data — TidalStation + TidalStreamEntry

Tidal stream data at specific passages is stored in two tables:

**`TidalStation`**: a named measurement point from a published tidal stream atlas.
- `id` (UUID v7), `name` (VARCHAR 255), `location` (PostGIS `GEOMETRY(Point, 4326)`), `source` (VARCHAR 255, e.g. `"UKHO Chart 5011, Table 2b"`), `notes` (TEXT NULL), `mean_spring_range_m` (NUMERIC NULL).
- No `user_id` — tidal stations are shared reference data, not user-owned.
- Seeded from published atlases via a management command; admin-editable only in M5. Community contribution opens to moderated user submissions in M7+.

**`TidalStreamEntry`**: one row per hour relative to HW per station.
- `station_id` FK → `tidal_station.id` CASCADE DELETE
- `hours_from_hw` INTEGER, -6 to +6
- `direction_degrees` NUMERIC 0–360 (direction the stream flows *towards*)
- `spring_rate_knots` NUMERIC NULL
- `neap_rate_knots` NUMERIC NULL
- Primary key: `(station_id, hours_from_hw)`

Rate at any intermediate tidal coefficient is interpolated linearly between neap and spring rates using the day's actual range as a fraction of the mean spring range (MSR). When MSR is absent (community-contributed stations), the interpolation falls back to the spring rate — conservative but adequate.

**Manual stream fields on `Sea`** (for stretches without `TidalStation` coverage):

A paddler with a tidal atlas, pilot book, or local knowledge can enter stream parameters directly on the day's sea record. Four new nullable fields on `Sea`:

| Field | Type | Notes |
|-------|------|-------|
| `flood_direction_degrees` | NUMERIC NULL | Direction stream flows *towards* during flood (0–360) |
| `ebb_direction_degrees` | NUMERIC NULL | Direction during ebb (often ~180° opposite, but not always) |
| `max_spring_rate_knots` | NUMERIC NULL | Peak rate at spring tides |
| `max_neap_rate_knots` | NUMERIC NULL | Peak rate at neap tides; falls back to spring rate if null |

With these plus `high_tide`, `low_tide`, and `tidal_range_m`, `TidalService` derives the rate and direction at any hour using the rule of 12s and neap/spring interpolation.

---

### 4. Rule of 12s — pure service-layer calculation

The rule of 12s is not stored. It is a stateless calculation in `TidalService`:

```
fractional_parts = [1, 2, 3, 3, 2, 1]   # 12ths per hour (hour 1..6 from LW)
tide_height(t) = lw_height + (sum of fractions for hours elapsed) / 12 × tidal_range
```

`TidalService.height_at(day: Sea, t: time) -> float | None` — returns `None` if any of `high_tide`, `low_tide`, `tidal_range_m` is absent.

`TidalService.rule_of_twelfths(day: Sea) -> list[dict]` — returns 6 dicts `{ hour_from_lw, fraction_of_range, cumulative_fraction, estimated_height_m }` for display alongside the raw tidal data. Returns `None` when tidal data is absent.

---

### 5. Tidal gate detection — PostGIS proximity + slack window

`TidalService.tidal_gates_for_day(day: Day, route_points: list[Point]) -> list[dict]`

For each point on the day's route:
- Query `TidalStation` records within 5 km using PostGIS `ST_DWithin`.
- Look up the stream entry for the hour the paddler is expected to be there (derived from `day.date`, `day.start_point_id` time offset, and `itinerary.avg_speed_knots`).
- Flag as a *tidal gate* warning if stream rate at that hour exceeds 2.0 knots (configurable) — most kayakers cannot make headway against faster streams.
- Slack water window: entries where `spring_rate_knots < 0.5` define the safe transit window; the warning includes the next slack window time.

This method returns warnings surfaced on the day detail panel and as marker annotations on the itinerary map. Tidal gate detection assumes constant speed (`avg_speed_knots`) — mid-leg speed variations are not modelled. Treat warnings as planning guidance, not hard gates.

---

### 6. Velocity overlays — leaflet-velocity, wind and swell primary

`leaflet-velocity` (already installed) drives animated overlays on the itinerary map, targeting a Windy-like animated particle flow where speed and direction are immediately legible without reading numbers.

**Layer defaults and sources**:

| Layer | Source | Default |
|-------|--------|---------|
| Wind (animated particles) | `WeatherState.wind_force` / `wind_direction` | **On** |
| Swell (animated particles) | `SeaState.swell_wave_height` / `swell_wave_direction` | **On** |
| ~~Tidal stream (animated particles)~~ | — | **Superseded by §6a (M4d)** |

> **Superseded (M4d).** Rendering a tidal stream as a continuous particle field was wrong: a tidal
> stream is a *point* phenomenon (a tidal diamond), not a field, and a wind-like flow misrepresents
> it. See **§6a — Tidal streams as chart diamonds**. Wind and swell remain particle fields — they
> genuinely are fields.

**Tidal stream layer — two sources, one layer, priority fallback** *(superseded — see §6a)*:

1. `TidalStation` / `TidalStreamEntry` within the day's bounding box (hydrographic, highest accuracy): per-station vectors synthesised into a local velocity grid. Spatially varying.
2. `Sea` manual stream fields (`flood_direction_degrees` etc.) when no station coverage: uniform vector field for the whole day's bounding box. Clearly labelled as "manually entered (atlas / local knowledge)".
3. Neither present → endpoint returns empty grid; layer hidden.

OpenMeteo ocean current vectors remain stored in `SeaState` but are not exposed as a layer in M5 — they are too coarse for coastal kayaking planning and risk misleading paddlers in complex tidal environments.

**Colour ramps**:
- Wind: Beaufort-matched — green (B0–3) → yellow (B4–5) → orange (B6–7) → red (B8+)
- Swell: height-matched — green (< 0.5 m) → yellow (0.5–1.5 m) → orange (1.5–2.5 m) → red (> 2.5 m)
- Tidal stream: speed-matched — green (< 1 kn) → yellow (1–2 kn) → orange (2–3 kn) → red (> 3 kn)

### 6a. Tidal streams as chart diamonds (M4d) — supersedes the §6 stream-particle decision

A tidal stream is documented in atlases and skippers' charts as a **tidal diamond**: a single
labelled point with a flow direction and rate that varies by the hour relative to HW, valid over a
small radius. This is exactly what the existing data model already captures — `TidalStation` (a POINT
location + mean spring range) and `TidalStreamEntry` (per-`hours_from_hw` direction + spring/neap
rate). The §6 decision discarded that structure by smearing each diamond into a uniform velocity
grid; M4d renders the diamonds directly.

**Rendering**: each in-range diamond is a chart-style ◇ marker at its real lat/lng with a direction
arrow, a rate label ("1.8 kn"), the existing speed colour ramp, and a faint **radius circle**
(display-only, default ~500 m, **user-configurable per diamond** via `radius_m`). Click → popup with
the hour-by-hour rate/direction table. Diamonds re-resolve as the hour slider moves. Tidal stream is
removed from the `leaflet-velocity` layer; wind/swell stay particle fields.

**User-created diamonds**: `TidalStation` gains nullable `itinerary_id`, `created_by_user_id`,
`radius_m`, `entry_mode` (`atlas | simple`). Any trip member can drop a pin and enter data; it is
persisted as a trip-scoped station (not a route `Point` — the route linked list stays clean, and the
existing `ST_DWithin` tidal-gate logic picks user diamonds up for free). Global seeded stations keep
null ownership and stay read-only to users.

**Rate model**: atlas diamonds carry actual per-hour rates (spring↔neap interpolated by the day's
range vs `mean_spring_range_m`). The simplified "I only know the peak rate" entry is expanded across
the cycle by the **rule of thirds** — `1/3, 2/3, 3/3, 3/3, 2/3, 1/3` of max rate from slack — the
speed analogue of the rule of 12s (already implemented in `TidalService.stream_rate_from_sea`). Saved
simple-mode entries are synthesised into `TidalStreamEntry` rows so the read path stays uniform.

**Out of scope (roadmap):** automated tidal fetch via a user-supplied API key (BYOK) fills the same
diamond entities once the manual model exists. See ROADMAP.

**react-leaflet integration pattern** — `leaflet-velocity` is a vanilla Leaflet plugin with no react-leaflet wrapper. The correct integration is a `"use client"` component that:

```tsx
"use client"
import { useEffect } from "react"
import { useMap } from "react-leaflet"
import L from "leaflet"
import "leaflet-velocity"

export function VelocityLayer({ data, options }: VelocityLayerProps) {
  const map = useMap()
  useEffect(() => {
    if (!data) return
    const layer = (L as any).velocityLayer({ displayValues: true, data, ...options })
    layer.addTo(map)
    return () => { map.removeLayer(layer) }
  }, [map, data, options])
  return null
}
```

This pattern must not be varied (direct DOM manipulation, ref-based access) — doing so breaks react-leaflet's internal layer lifecycle management.

---

### 7. UI visual language — conditions display

Text-only display of conditions is insufficient for field use. Conditions are visually encoded at every level: day strip chips, the per-day detail panel, and the map.

**Icons** — Lucide (already installed) covers all condition state icons needed. No additional icon library introduced in M5.

| Condition | Lucide icon |
|-----------|-------------|
| Clear / sunny | `Sun` |
| Partly cloudy | `CloudSun` / `CloudMoon` |
| Overcast | `Cloud` / `Cloudy` |
| Rain / showers | `CloudRain` |
| Drizzle | `CloudDrizzle` |
| Thunderstorm | `CloudLightning` |
| Snow | `CloudSnow` |
| Fog | `CloudFog` |
| Wind | `Wind` |
| Waves / sea state | `Waves` |
| Temperature | `Thermometer` |

**Wind direction in compact contexts**: `Navigation2` icon CSS-transformed to bearing (`transform: rotate({deg}deg)`), paired with a Beaufort severity pill.

**Wind speed in the detail panel**: **wind barbs** — the meteorological and nautical standard used on GRIB viewers, weather fax charts, and coastal forecasts. BCU/ACA-trained paddlers read barbs intuitively. Barb anatomy: shaft points in wind direction (from origin); full barb = 10 knots; half barb = 5 knots; triangle pennant = 50 knots. Implemented as a `WindBarb` React component (~60 lines) at `components/weather/wind-barb.tsx`. No external library.

**Beaufort scale — semantic severity pill**:

| Beaufort | Band | Token |
|----------|------|-------|
| 0–3 | Calm / light / gentle / moderate | green |
| 4–5 | Fresh / strong breeze | yellow |
| 6–7 | Near gale / gale | orange |
| 8+ | Strong gale and above | destructive (red) |

Conversion from m/s (OpenMeteo output) to Beaufort is a pure utility function in `lib/weather/beaufort.ts`. Same function drives the leaflet-velocity wind colour ramp.

**Wave height — WMO sea state scale**:

| Height | WMO condition | Token |
|--------|---------------|-------|
| < 0.5 m | Calm / glassy | green |
| 0.5–1.5 m | Slight / moderate | yellow |
| 1.5–2.5 m | Rough | orange |
| > 2.5 m | Very rough / high | destructive |

Wind-wave and swell heights are shown separately — they are distinct phenomena. A 0.8 m wind chop on top of a 1.8 m swell is a different situation from either value alone.

**Day strip chips**: three chips maximum per card (wind + wave + tide). Icon + value with severity colour. If all three values are absent, the chip section is hidden entirely. Individual absent values within a populated chip set show `—`.

| Chip | Icon | Content |
|------|------|---------|
| Wind | `Navigation2` rotated to bearing | Beaufort pill |
| Wave | `Waves` | Combined height (wind-wave + swell), coloured by severity |
| Tide | `ArrowUp` / `ArrowDown` (flood/ebb) | `HW HH:MM` or `LW HH:MM` |

**Detail panel time-series**: a horizontally scrollable compact data grid — one column per hour. No chart library introduced in M5. Each column: time, `WindBarb` SVG, Beaufort pill, precipitation icon (shown only when > 0 mm), temperature, wind-wave height + period, swell height + direction arrow + period. Renders client-side only (data fetched lazily via `useEffect`).

**Tidal gate warnings**: `AlertTriangle` (Lucide, orange) for blocking gates (`isBlocking: true`); `Info` for informational. Blocking gate rows carry an orange background highlight.

---

## Expedition Log Auto-Generation

### The problem

Paddling logs are only useful if they exist. Requiring users to manually create a log entry at the end of each expedition day — after hours on the water, setting up camp, and making dinner — means logs will be missed or filled in retrospectively with degraded accuracy.

The system already collects the data needed to construct a meaningful log automatically: GPS position pings during a live expedition (M8) and weather/sea conditions per day per location (M5).

### What is auto-generated

At the end of each expedition day, a Celery task generates a `Log` record:

- **Mileage**: sum of haversine distances between sequential GPS position pings recorded for that member on that day. If GPS data is sparse (< 3 pings, or gaps > 2 hours), falls back to the sum of inter-point distances in the recorded itinerary. If neither is available, `mileage = null` and the user is prompted to enter it manually.
- **Duration**: timestamp of first ping to timestamp of last ping.
- **Conditions snapshot**: sea state, wind speed/direction, and temperature from the M5 weather/sea record for that day and location.
- **Route snapshot**: ordered GPS position pings stored as a GeoJSON LineString on the log record.

The user then fills in optional narrative fields: free-text notes (logbook), difficulty rating (1–5), mood/energy rating (1–5), notable highlights (short text). These are intentionally optional — the auto-generated record has standalone value without them, and optional fields have higher completion rates than mandatory ones. Difficulty and mood ratings enable downstream personal analytics (average difficulty per season, energy patterns across multi-day trips).

If no GPS data and no itinerary data exist for a day, the task creates a stub log with `mileage = null`, `duration = null`, and `source = "manual"`. A log record with no mileage is still a valid logbook entry — it captures conditions and any notes the user adds.

### Dual-trigger model

Two triggers maximise reliability:

1. **Manual trigger (primary)**: the trip leader explicitly closes the day in the live expedition view. This immediately enqueues the Celery task for all members on the trip.
2. **Scheduled fallback (secondary)**: a Celery Beat task runs nightly at 00:30 UTC and checks all trips in `happening` state. For any day that has ended (based on trip timezone) but has no log record, it enqueues the generation task. Does not overwrite a log that already exists.

The scheduled fallback handles: leader forgetting to close the day, app crash, network failure during manual trigger.

### Timezone handling

All timestamps are stored in UTC. The "day boundary" for fallback triggering is computed using the trip's geographic region timezone, derived from the expedition start/end coordinates via `timezonefinder` at trip creation time and stored as `Trip.timezone_name`. Display in the frontend always converts UTC → local timezone.

`timezonefinder` adds a dependency and a one-time startup cost (loads a ~22 MB timezone database). Use a lazy singleton. If the trip location changes after creation, the timezone may be stale — acceptable for the MVP.

### GPS-based mileage limitations

GPS-based mileage is only as accurate as the ping frequency. If a user's device goes offline for hours (common at sea), straight-line interpolation will underestimate real distance. Document this as a known limitation; do not compensate with heuristics. Stub logs with `mileage = null` are the correct response to absent GPS data — not fabricated estimates.

### Privacy

GPS tracks on log records are personal data. Apply the same GDPR erasure rules as other user data: cascade delete on account deletion, anonymise on trip archival if leader is deleted (per the erasure model in `trip-lifecycle.md`).

---

## Map Annotations (community POIs)

### The problem

The `Point.interest` type was a digression. A POI — a freshwater tap, a good restaurant, a sheltered
lunch beach, a launch slipway — is **not part of the paddled route**. Yet `interest` was a `Point`
subtype threaded onto the same linked list as `stop`/`position` (the route polyline still passes
through interest points because `validPoints` is not type-filtered), it was scoped to a single day,
and it died with the trip. None of that fits what a POI actually is: a standing annotation on the
sea, valid regardless of any one trip's day structure, and worth sharing with other paddlers.

### Decision

**Deprecate `interest` as a `Point` type. Reintroduce POIs as a standalone *annotation* entity,
modelled on the tidal-diamond pattern (M4d).** A POI is dropped on the map like a diamond, persisted
with its own geometry — **not** as a route `Point` — and surfaced as a toggleable marker layer. This
keeps the route linked list to what it is (the paddled line of `stop`/`position` points) and gives
POIs the independent, durable life they need.

The entity mirrors `TidalStation`'s shape:

- Own `GEOMETRY(Point, 4326)` location; **no** `next_id`, **no** membership in `pointOrder`.
- `itinerary_id` **nullable** — null = a global, community-contributed POI (the OpenSeaMap-seamark
  analogue); set = a POI private to one trip's planning.
- A **category** (freshwater, food, campsite/bivvy, slipway/launch, toilet, hazard, viewpoint,
  shelter…) driving an OpenSeaMap-style icon, plus a label and optional note.
- Drop-a-pin creation by any trip member (same affordance as diamonds), edit/delete by the creator.
- **Survives the day boundary** — it belongs to the itinerary/community, not to a `Day`.

### Visibility — public independent of itinerary

POIs carry a `visibility` flag. The heavy end ("public") makes a POI part of a **community
gazetteer**: visible to everyone planning in that area and on the public landing-page map. This is a
**new public shape, decoupled from any trip or itinerary** — unlike route visibility, which lives on
`Itinerary` (see `trip-lifecycle.md`). A community POI is public on its own terms. Because public
contributions invite moderation, dedup, spam control, and edit-trust, the **public/community tier is
deferred to the M7 community milestone**; trip-scoped (private) annotations ship first. Same phasing
logic as BYOK tidal and the public route library: build the model with the flag now, gate the
community surface behind moderation later.

**Resolved on implementation (M4e, 2026-06-21).** The entity shipped as **`Place`** (not
`Annotation`/`Spot`/`POI`) — neutral enough for a hazard or a café and reads as a future community
directory. **Category is its own entity, `PlaceCategory`** (slug/name/icon, seeded at startup, read
via an authenticated `GET`) — the M2 `ItemCategory` decision, so the
catalogue grows without a migration. The seeded set: freshwater, food, campsite, slipway, toilet,
hazard, viewpoint, shelter, other.

**Category authoring opened to admins (2026-06-21, post-M4e).** Initial testing showed the seeded
taxonomy was too narrow, and extending it by hand (edit-seed-and-restart, or raw DB inserts) is slow.
Because `PlaceCategory` is an entity by design and a global `admin` flag + `require_admin()` already
exist, an **admin-only `POST /api/place-categories`** is the cheap, consistent bridge: it extends the
catalogue at runtime without a migration. Create-only for now — delete is risky while `Place` rows
FK-reference categories, and is deferred until there's a real need plus an in-use guard. Caveat: the
endpoint relieves the backend fully, but a new `icon` only renders as a distinct glyph once its
kebab-case name is in the frontend `place-icons` map — unknown names fall back to a plain pin. Given
that the admin endpoint without a frontend authoring UI is barely more than a validated `INSERT`,
the near-term value is the **seed taxonomy itself**; runtime category management proper rides with
the M7 community milestone. This is explicitly a **stepping-stone admin tool, not the M7 community
feature**, which still owns the public taxonomy, moderation, and final icon set.

**Seed broadened to 23 categories (2026-06-21), kayaker-curated.** Added: water/resupply (shop, fuel,
pub), accommodation, land transport (parking, harbour, bus, train), on-water (ferry), safety & comms
(lifeboat/coastguard, first_aid, phone_signal), scenery (beach), wildlife. Deliberately **dropped**:
*lighthouse* (the OpenSeaMap seamark overlay is a more reliable source than user input), *tide_race*
(the tidal-diamond layer already owns tidal turbulence), *swimming* (no honest glyph — `waves` reads
as hazard), *portage* (niche for coastal work; a labelled `hazard`/`other` covers it). `placeColor`
now keys off a `HAZARD_SLUGS` set so any future hazard subtype tints red without a code change.
Capped near ~24 so the drop-a-pin picker stays browsable; `label`/`note` cover the long tail.

**Photos on a `Place` — declined (M19, 2026-08-22).** M19 asked whether a `Place` should carry its
own images so a public route could show the beach, the parking, the slipway. It should not, and the
reason is that **a `Place` is already self-describing while a public `Point` is not**: a place
renders a category glyph, a `label` and a `note`, whereas a point in the public shape carries only
a name (`Point.notes` is private by decision and stays that way). A photo hung on a place decorates
text rendered a few pixels away; the same photo hung on the nearby route point is carrying the
entire descriptive load. Geometry makes them interchangeable in practice — a `Place` on an
itinerary is by construction near that itinerary's route, so the parking above the put-in and the
Day 1 start point are metres apart.

The cost avoided is not just an association table: `Place.images` would need cascade configuration
in **the exact defect class M16 found three real production bugs in** (`Day.points`' missing
cascade, `Point.next`'s missing `passive_deletes`, the asymmetric-cascade `SAWarning` — orphaned
rows living inside coverage-green lines), a second upload/opt-in path, a public shape carrying two
image sources, and a gallery merging them under an ordering rule. Point images already exist,
already have a public opt-in (`Image.is_public`, M7d) and are already tested.

Consequence: the itinerary gallery is **flat and single-source** — the author's opted-in point
photos, each captioned, falling back to the point's own name and day when no caption was written
(`Image.caption` is optional; an anonymous photo is the thing to avoid). Places still reach the
public sidebar as glyph + label + note. Clicking a photo pans the map to its point, which stays a
single implementation because there is a single owner.

**Not "never":** if the campsite/launch-spot database in `ROADMAP.md` ever ships, the place becomes
the unit people browse and a shared entry without a photo is weak — photos ride with that
community gazetteer, which is deferred and unscheduled (M7, 2026-06-22).

**Migration**: although pre-production, the dev database held real `interest` rows, so the migration
(`b3e7c1a9d240`) **converts `interest` → `position`** (rather than deleting) and recreates the
`pointtype` enum without `interest` (Postgres has no `DROP VALUE`). The former POI consumers
(`GET /api/point/pois`, `PointService.get_points_in_range`, the `interest` guards in `tidal_service`
and `weather_fetch_task`) were removed; proximity queries now live on `Place`
(`GET /api/place/by-itinerary/<id>/range`). Open items remaining: moderation/dedup/edit-trust for the
public tier (M7).

## Inventory & Gear (M6)

### The problem

The original M6 plan assumed items live *inside* an inventory — `createItem(inventoryId, …)`,
inventories showing an "item count", an inventory nesting an `items` array. The backend built in
M2 had already settled on a different, cleaner shape, and the plan had drifted from it.

### Decision — two separable concerns

**Personal gear is owned by the *user*, not by an inventory. Trip needs are *requirement slots* on a
trip's inventory. Contribution links one personal item to one slot.**

- **`Item`** is personal gear: it carries `user_id` and **no `inventory_id`**. A paddler's gear
  closet is just "every `Item` where `user_id = me`", served by `GET /api/item/all` (scoped by the
  authenticated user — no `@require_owner`, mirroring `GET /api/inventory/all`).
- **`Inventory`** belongs to a trip (or, for a personal list, to a user) and holds **`TripRequirement`
  slots** — never items directly. A requirement is a named need (`name`, optional `category`,
  `status: needed | covered`).
- **Contribution** (`POST …/requirements/:id/contribute`, body `{ itemId }`) is the act that ties a
  personal item to a requirement slot via `covering_item_id` + the `requirement_contributors`
  junction. It is a distinct action from owning the item.

### Item lifecycle — three distinct states, plus packing

1. `suggested` — the app or a template proposed it; the paddler may not own it yet.
2. `owned` — the paddler confirmed possession (promoted via `PATCH /api/item/:id { status }`).
3. *assigned to a trip* — the separate `contribute` act. **Only `owned` items qualify** —
   `contribute` rejects any item whose `status != owned` (`400`), so unconfirmed gear can't be
   committed to a trip. Pre-departure packing confirmation (`checked`) is a fourth moment, scoped to
   the item/requirement, not the same as ownership.

### Item creation requires only authentication

Because items are personal and not inventory-scoped, **creating an item needs only a valid session**
— `POST /api/item/create` no longer gates on inventory ownership. (Previously it ran
`@require_owner('item', parent_resource=('inventory', 'inventoryId'))`, forcing the client to pass an
owned `inventoryId` that the service then *discarded* — pure ceremony that contradicted the
personal-gear model.) `user_id` is stamped from the auth context in `ItemSchema`.

This supersedes the M6 plan's "items live in inventory" framing; the plan was updated to match.

## Community safety data — what the app will NOT crowdsource (M7)

When M7 ("Logs, Profile & Community") was scoped (2026-06-22), two features that earlier ADRs had
*deferred to M7* — a public community gazetteer of `Place` POIs and a peer-endorsed shared atlas of
community tidal-stream diamonds — were re-evaluated against liability and moderation cost, and
**removed or deferred unscheduled**. This supersedes the "deferred to M7" framing in the Map
Annotations section above and in `trip-lifecycle.md`'s second-public-shape note.

**Community tidal-stream diamonds — DROPPED, not deferred.** Tidal-stream data is life-safety data: a
wrong rate or direction at a tidal race is a drowning, not an inconvenience. The decisive point is not
that a moderation/trust system is hard to build — it is that **applying an endorsement/publish gate
turns the app from a neutral conduit into a publisher that *vouched* for third-party safety data**,
which is precisely what manufactures a duty of care and legal exposure. Building the trust system is
what *creates* the liability. User-created diamonds therefore stay **trip-private** (M4d status quo).
The only sanctioned path to automated tidal data is the roadmap's **BYOK** model — the user fetches
under their *own* licence from an authoritative source; the app never publishes or vouches. This is a
deliberate, recorded refusal so it cannot quietly creep back into a later milestone.

**Public community gazetteer of Places — DEFERRED, unscheduled.** Lower stakes (a wrong campsite is an
inconvenience), but it still needs a community and a trust answer that does not exist, and would impose
a standing moderation queue on a solo operator. If it ever ships, the model is **report-and-takedown,
never endorsement-to-publish**: contributions auto-publish, attributed; users flag; the operator
removes on report — the app never *endorses* a contribution. Places stay **trip-private** (M4e status
quo) until real traffic justifies otherwise. Net effect: the "moderation/trust substrate" is not built;
nothing in shipped M7 (M7a–M7c) needs it.

**Log endorsement — same-trip mutual attestation.** Log endorsement (M7a) is the *only* surviving
endorsement surface, and it is **relational verification of a shared experience**, not a social "like."
A user may endorse a log only if they shared the **exact trip the log documents** with its author —
both (have) held a `TripMember` for that trip, and self-endorsement is blocked. This is two-way
validation: the endorser corroborates the author's record, and the log corroborates the endorser's
presence. It requires `Log.trip_id` (added in M7a; populated by M8 auto-generation); a standalone log
with no trip is non-endorsable. The today-open `endorse_log` (any user, any log, self included) is
tightened to this rule in M7a.

**Safety disclaimer (pre-production).** The app already surfaces planning-grade safety data (tidal-gate
warnings, weather, rule-of-12s). A "planning aid only — not a substitute for official charts, tide
tables, and sound seamanship" disclaimer must appear **both in the app UI** (where safety data is
shown) **and in the Terms of Use** (the TOU is what limits liability; the banner alone does not).
Tracked on the `CLAUDE.md` Production Readiness checklist and ROADMAP Privacy & Legal.

## Decision log

| Decision | Original ADR | Date | Notes |
|----------|-------------|------|-------|
| Weather & sea: OpenMeteo, tidal model, rule of 12s, velocity overlays, UI language | ADR-028 | 2026-05-27 | Tidal automation deferred; manual path comprehensive in M5; `Sea` schema ready for automation |
| Expedition log auto-generation — Celery dual-trigger | ADR-021 | 2026-05-11 | Requires M8 GPS infrastructure; stub logs for trips without GPS data |
| Tidal streams as chart diamonds, not a velocity field (supersedes §6 stream-particles); trip-scoped user-created diamonds; rule of thirds for simple entry; BYOK tidal API deferred to roadmap | M4d | 2026-06-18 | §6a; reuses `TidalStation`/`TidalStreamEntry`; radius display-only, user-configurable (~500 m default) |
| Deprecate `Point.interest`; reintroduce POIs as standalone map annotations (tidal-diamond pattern, own geometry, survive day boundary); `visibility` flag, trip-scoped first → public community gazetteer deferred to M7 | — | 2026-06-20 | Reverses the `interest` point-type decision; public POIs are a new public shape independent of `Itinerary` (cross-ref `trip-lifecycle.md`); scoped in annotation milestone plan |
| M4e landed: annotation entity is **`Place`** + **`PlaceCategory`** (category an entity, not an enum); `interest` removed from `PointType` (migration converts existing rows → `position`); place markers as a day-independent toggleable layer, drop-a-pin via a top-centre "+ Add" control | — | 2026-06-21 | Resolves the open entity-name/taxonomy items above; POI proximity query moves from `/api/point/pois` to `/api/place/by-itinerary/<id>/range`; public/community tier still deferred to M7 |
| Admin-only `POST /api/place-categories` to extend the catalogue at runtime (create-only); seed broadened to 23 kayaker-curated categories | — | 2026-06-21 | Bridge tool, not the M7 community feature; reuses existing `admin` flag + `require_admin()`; added safety/comms (lifeboat/first_aid/phone_signal), transport (bus/train), accommodation, beach, etc.; dropped lighthouse (→ OpenSeaMap seamarks), tide_race (→ tidal diamonds), swimming, portage; `placeColor` now uses a `HAZARD_SLUGS` set; new icons render only once added to the frontend `place-icons` map, else fall back to a pin |
| Inventory & Gear model: items are personal (user-owned, no `inventory_id`); inventories hold `TripRequirement` slots; `contribute` links an `owned` item to a slot; item lifecycle `suggested → owned → assigned`; `contribute` rejects non-`owned` items; item creation requires only auth (decoupled from inventory ownership) | M6 | 2026-06-20 | Supersedes the M6 plan's "items live in inventory" assumption; backend additions: `GET /api/item/all`, `status` in item PATCH whitelist, `owned`-only contribute guard |
| Inventory authorship & multi-contributor model: each member is sovereign over their own entries. `TripRequirement.proposed_by_member_id` (NOT NULL; defaults/templates → leader) — delete iff you proposed it (no leader override). Contribution becomes a true M2M via a `RequirementContribution(requirement, member, item, checked)` association (unique per member/requirement), replacing the single `covering_item_id` + plain `requirement_contributors` junction; `unclaim` is caller-scoped. `status` becomes **derived** (≥1 contribution = covered), not stored. Member-leave and account deletion cascade proposed requirements + contributions but never the personal `Item`. | M6b | 2026-06-20 | Fixes M6's unenforceable removal (no authorship) and incoherent multi-contributor `unclaim`; deliberate divergence from leader-gated trip/itinerary management — gear coordination is collaborative; cascade removes any need for a leader cleanup escape hatch. Plan: `plans/M6b.md` |
| Inventory seeding + private personal packing (folded into M6b): (1) a trip's checklist no longer starts empty — `Inventory` is **auto-created at trip creation** and pre-seeded with a leader-owned default requirement set (`DEFAULT_TRIP_REQUIREMENTS` in `Api/seed.py`), retiring the M6 §4 "leader create inventory" button; the leader-authorship default makes the seeded set the leader's to prune. (2) New `gear` item category (paddling kit) added to the seed. (3) New `PersonalPackingItem(trip_member, item, checked)` association — a **private** per-member, per-trip "My kit" list of your own gear-closet items, distinct from group requirements; only the owner reads/writes it (no leader access); cascades on member-leave / account deletion, never the `Item`. | M6b | 2026-06-21 | Driven by user feedback that the original intent was a seeded per-trip requirement set, that the `gear` category was missing, and that personal carried-kit needs tracking separate from collective contributions. `CatalogItem` template entity still deferred (flat hardcoded default list for now). Plan: `plans/M6b.md` |
| M7 carve-up + no crowdsourced safety data: M7 splits into **M7a (logs/stats/profile) → M7b (paddler connections: search/invite/buddies/blocking) → M7c (route discovery) → M7d (trip narrative)**. **Community tidal diamonds DROPPED** (publishing/vouching for crowdsourced life-safety tidal data manufactures duty-of-care liability; BYOK is the only sanctioned automation path; diamonds stay trip-private). **Public Place gazetteer DEFERRED unscheduled** (report-and-takedown only if ever built, never endorsement-to-publish; Places stay trip-private). Log endorsement is the only endorsement surface: **same-trip mutual attestation** — endorse only a log of the *exact trip you shared* with the author, self-endorse blocked; requires `Log.trip_id`. Safety-disclaimer required in both app UI and Terms of Use. | M7 | 2026-06-22 | Supersedes the "deferred to M7" framing on public Places/diamonds in this doc's Map Annotations section and in `trip-lifecycle.md`; no moderation/trust substrate is built. Plan: `plans/M7.md` |
| Certifications are profile self-presentation, **not** wired into endorsement weighting: a cert is a badge a paddler wears on their own (opt-in, `profile_is_public`-gated) profile — it does **not** flow into the endorser list or weight an endorsement. Endorsement stays **flat factual attestation** ("I shared this trip and corroborate it happened"), equal regardless of the endorser's rank. Certs in M7a are **self-asserted/unverified**, so using them as a credibility multiplier would (a) corrupt the attestation's meaning, (b) cross the M7 no-vouching line by implying the app trusts an unverified claim, and (c) build rank-gatekeeping over newcomers. Keeping certs decorative-only is also what lets them stay self-asserted without harm. No expiry reminders (no Celery task/email/column) — at most a frontend-derived "expired" pill (`valid_until < today`); issuing bodies own the cert lifecycle. | M7a | 2026-06-23 | Endorser list stays shallow (`{id, username, name, avatarUrl}`); a viewer can still inspect someone's certs by clicking through to their public profile — right friction, no broadcast of rank. Verification (upload / issuing-body lookup) deliberately out of scope while certs are decorative-only. Plan: `plans/M7a.md` |
| Meals/provisioning groundwork (M12 §Q): **defer all schema work** — the future ration calculator needs its own `Ingredient`/`Meal` entities (divisible units with per-unit gram weight + per-person portion size; meals composed of several ingredients; a day's ration = sum over its meal slots × crew × trip length; perishable vs shelf-stable as a per-ingredient attribute), which does **not** extend the flat `Item`/`TripRequirement` gear-checklist model. Adding a provisioning flag to `Item` now would likely go unused by the real feature, so nothing lands in the schema this phase — the model is captured in ROADMAP.md's "Meals & provisioning" subsection instead. The ingredient-combination *recommender* (tasty/energetic/healthy suggestions) is explicitly a separate, later, possibly-premium feature; the mechanical calculator is the priority. | M12 §Q | 2026-07-14 | Doc-only decision — prevents more inventory UI baking in gear-checklist assumptions the meals model would then have to fight; ROADMAP.md (private, gitignored) holds the full product framing. Plan: `plans/M12-phase9-10.md` |
| **Photos on a `Place` — declined.** A `Place` already renders a category glyph, a `label` and a `note`; a public `Point` renders only a name (`Point.notes` is private by decision). So a place-photo decorates text already on screen, while the same photo on the nearby route point carries the whole descriptive load — and a `Place` on an itinerary is by construction metres from that route, so the two are interchangeable in practice. Avoided cost is not merely an association table: `Place.images` needs cascade config in **the exact defect class M16 found three production bugs in**, plus a second upload/opt-in path, a public shape with two image sources, and a merge/ordering rule for the gallery. Consequence: the itinerary gallery is **flat and single-source** (opted-in point photos), `Image.caption` is optional and falls back to the point's name + day, and click-to-pan has one implementation because there is one owner. Places still reach the public sidebar as glyph + label + note. **Not "never"** — photos ride with the deferred campsite/launch-spot gazetteer, where the place *is* the browsed unit | M19 §3 | 2026-08-22 | Drops a whole phase from M19 without changing what the milestone delivers. `ROADMAP.md` (Map annotations / Campsite database) carries the product-side note |
| Expedition log auto-generation landed (supersedes the ADR-021 row above's design-stage framing): dual trigger is the leader's Navigate-mode "close day" button (`POST /live/trip/<id>/close-day`, immediate) and a nightly beat fallback (`crontab(minute=30, hour=0)`, closes yesterday's Day for any happening trip that never got closed manually). Mileage = ping-track haversine sum unless <3 pings or any inter-ping gap >2h, else falls back to the day's own point-to-point itinerary distance, else `null` (stub log, still `source="auto"`). `Trip.timezone_name` resolves from the itinerary's **first located point at the building→happening transition**, not at trip creation as ADR-021 originally implied — no coordinates exist yet at creation; falls back to UTC when unresolved (`trip_today()`). Position pings retained 30 days past a trip's `date_to` before the D3 retention sweep deletes them — the Log's `route_geojson` snapshot is the durable record after that | ADR-021 | 2026-07-21 | `Services/expedition_log_service.py`, `Tasks/expedition_log_task.py`, `Services/Utils/timezone_utils.py`. Plan: `plans/M8.md` §8 |
