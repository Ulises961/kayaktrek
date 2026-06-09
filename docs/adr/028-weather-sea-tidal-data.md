# ADR-028: Weather, Sea & Tidal Data — OpenMeteo, tidal stream model, rule of 12s

**Status**: accepted
**Date**: 2026-05-27

## Context

M5 adds per-day weather and sea conditions to the itinerary. Three distinct data concerns
must be resolved:

1. **Weather and sea swell** (temperature, wind, wave height, swell period): a free,
   high-quality global source is needed. No paid API dependency at zero revenue.

2. **Tidal heights** (high/low tide times and range): necessary to calculate water depth
   at any hour and to drive the rule of 12s display. Automated global tidal prediction
   requires a paid service (WorldTides, Stormglass) or a local prediction library fed by
   harmonic constituent data. No free, high-quality global automated source exists.

3. **Tidal streams** at specific passages (tidal races, channels, headlands): current
   speed and direction by hour relative to high water. This data is hydrographic — it is
   published by national authorities (UKHO for UK waters, NOAA for US, SHOM for France,
   BSH for Germany) and is not available through any general-purpose weather API.
   Published tidal stream atlas data is the ground truth used by professional kayakers.

The existing `Sea` model stores `high_tide` and `low_tide` as `Time` fields but has no
tidal range — making rule of 12s calculations impossible without it. There are no
`TidalStation` or `TidalStreamEntry` tables.

ADR-006 and ADR-027 both flag `leaflet-velocity` (already installed) for wind and ocean
current overlays — those overlays require per-hour current vectors that OpenMeteo's marine
API provides. ADR-007 establishes that OpenMeteo responses are cached in Redis DB 1 via
Flask-Caching, wired at M5.

The rule of 12s is an approximation used by sea kayakers to estimate tidal height at any
hour given only the high/low water times and range. It is a calculation, not a database
artefact.

---

## Decisions

### 1. Weather and sea swell — OpenMeteo

OpenMeteo's free Marine Weather API (`https://marine-api.open-meteo.com/v1/marine`) covers:
- Hourly wave height, wave direction, wave period
- Swell wave height, direction, period (wind swell vs primary swell separated)
- Hourly ocean current speed and direction (available for most coastal regions)

OpenMeteo weather API (`https://api.open-meteo.com/v1/forecast`) covers:
- Hourly temperature, precipitation, wind speed, wind direction, cloud cover

These two endpoints are fetched in a single Celery task per itinerary day, triggered
after `apply-boundaries` sets dates on days. Responses are cached in Redis DB 1 with a
6-hour TTL (conditions change slowly at day-planning granularity).

The `Weather` + `WeatherState` and `Sea` + `SeaState` models already exist and map
directly to these feeds. No schema change needed for OpenMeteo data — only the tidal
fields require migration.

### 2. Tidal times and range — manual operability first; automation deferred

**Why OpenMeteo cannot drive the rule of 12s**: OpenMeteo's marine API provides wave data
and `ocean_current_velocity` / `ocean_current_direction` from a global circulation model
(CMEMS/GFS). These are current speed in knots — not tidal heights in metres. The rule of
12s needs HW/LW times and a height range; neither exists anywhere in OpenMeteo's output.
OpenMeteo's current vectors are used only for storage; they must not be confused with
tidal prediction data.

**M5 decision: manual operability is the primary path.**

Automated tidal prediction (API integrations, harmonic grid models) is non-trivial
infrastructure — national API keys, a `TidalPort` reference table, ~30 GB model files
for global harmonic grid fallback — that may not land until well after M5. Building the
manual path comprehensively first means the feature is immediately useful to any leader
with a pilot book or local knowledge, without blocking on infrastructure. When automation
arrives it slots into the same `Sea` fields and the same precedence chain; no UI or
schema rework needed.

**`Sea` fields for full manual operability (M5 migration):**

- `high_tide` TIME — HW time at the planned location.
- `low_tide` TIME — LW time.
- `tidal_range_m` NUMERIC — height difference HW to LW in metres.
- `reference_port_name` VARCHAR nullable — the named port or passage the leader is
  referencing (free text; e.g. "Milford Haven", "Ramsey Sound north entrance"). Displayed
  alongside the derived values so crew know the basis of the prediction.
- `hw_time_offset_minutes` INTEGER nullable — signed correction applied to the reference
  port's HW time to reach the actual location. Null means the entered `high_tide` is
  already corrected.
- `lw_time_offset_minutes` INTEGER nullable — same for LW.
- `hw_height_ratio` NUMERIC nullable — height correction factor for HW.
- `lw_height_ratio` NUMERIC nullable — height correction factor for LW.
- `tidal_source` VARCHAR — provenance label, displayed in the UI:
  - `"manual"` — leader entered HW/LW/range directly.
  - `"manual_corrected"` — leader entered a reference port + corrections; HW/LW/range
    derived by the app from those inputs.
  - (Future) `"predicted_standard:<port>"`, `"predicted_secondary:<port>"`,
    `"predicted_grid"` — populated by the automated pipeline when it lands.

Any field the leader has set is never overwritten by automation. `tidal_source` signals
which fields are safe for the pipeline to populate.

**UI progressive disclosure in the detail panel (M5):**

The tidal data entry section presents the full chain of knobs without requiring the leader
to engage with any of them beyond what they know:

- **Quick entry** (most common): leader types HW time, LW time, range directly.
  `tidal_source = "manual"`. Done.
- **Port-referenced entry** (leader has a tide table): leader names the reference port,
  enters HW/LW from the table, optionally adds time and height corrections for their
  specific location. App derives the adjusted HW/LW/range and shows them. `tidal_source
  = "manual_corrected"`.
- Any entered field is visually distinguished from a computed or empty field — the leader
  always sees what they provided vs what the app derived.
- Derived HW/LW/range values (from port + corrections) are shown as editable — the leader
  can always override the final output directly.

**Automated prediction pipeline (architecture, deferred to a future milestone):**

When automation lands, it follows the standard port / secondary port model used by all
published almanacs. The `Sea` schema above already accommodates it:

- A `TidalPort` table stores reference ports (standard and secondary) with their
  published time and height correction offsets. Seeded from national authority open data.
- PostGIS `ST_Distance` (geography) finds the nearest port to the day's bounding box
  centroid. Tidal wave propagation is not strictly spatial, but straight-line nearest port
  is the correct starting point; secondary port corrections account for the coastal
  propagation offset.
- Free API sources by region: NOAA CO-OPS (US), SHOM (France), SMHI (Sweden), MET Norway,
  DMI (Denmark), Waterinfo.be (Belgium). UK gap: UKHO charges; global harmonic grid
  models (FES2022/EOT20 via `pyTMD`, ~30 GB server-hosted) are the fallback.
- The pipeline populates only fields the leader has not manually set. `tidal_source` is
  updated to reflect the API and port chain used.
- The reference port name, distance from route centroid, and any correction applied are
  stored on `Sea` and surfaced in the UI so the paddler understands how far removed the
  authoritative data is from their actual location.

**Decision for M5**: `Sea.high_tide`, `Sea.low_tide` remain manually entered by the trip
leader. A new `Sea.tidal_range_m` column (nullable float) is added for the height
difference between HW and LW — also manually entered. The UI presents these three fields
as an optional data-entry section on the day detail panel, labelled "Tidal data (from
almanac/chart)".

**Automated tidal prediction is deferred** to a post-M5 milestone using the pipeline
described above. The model is ready for it — `high_tide`, `low_tide`, and `tidal_range_m`
can be populated programmatically when that pipeline is implemented.

### 3. Tidal stream data — TidalStation + TidalStreamEntry, community/imported

Tidal stream data at specific passages is stored in two new tables:

**`TidalStation`**: a named measurement point published in a tidal stream atlas.
- `id` (UUID v7), `name` (VARCHAR 255), `location` (PostGIS `GEOMETRY(Point, 4326)`),
  `source` (VARCHAR 255, e.g. `"UKHO Chart 5011, Table 2b"`), `notes` (TEXT nullable).
- No `user_id` ownership — tidal stations are shared reference data, not user-owned.
- Seeded from published atlases via a management command; editable by admin only in M5.
  Community contribution (M7+) can open this to moderated user submissions.

**`TidalStreamEntry`**: one row per hour-relative-to-HW per station.
- `station_id` (FK → `tidal_station.id`, CASCADE DELETE),
  `hours_from_hw` (INTEGER, -6 to +6),
  `direction_degrees` (NUMERIC, 0–360, direction the stream flows *towards*),
  `spring_rate_knots` (NUMERIC, nullable),
  `neap_rate_knots` (NUMERIC, nullable).
- Primary key: `(station_id, hours_from_hw)`.

Rate at any intermediate tidal coefficient is interpolated linearly between the neap and
spring rates using the day's actual range as a fraction of the mean spring range (MSR).
MSR is stored on `TidalStation` as `mean_spring_range_m` (NUMERIC, nullable).

### 4. Rule of 12s — pure service-layer calculation

The rule of 12s is not stored. It is a stateless calculation in `TidalService`:

```
fractional_parts = [1, 2, 3, 3, 2, 1]   # 12ths per hour (hour 1..6 from LW)
tide_height(t) = lw_height + (sum of fractions for hours elapsed) / 12 × tidal_range
```

`TidalService.height_at(day: Sea, t: time) -> float | None` — returns `None` if any of
`high_tide`, `low_tide`, `tidal_range_m` is absent on the `Sea` row.

`TidalService.rule_of_twelfths(day: Sea) -> list[dict]` — returns a list of 6 dicts
`{ hour_from_lw, fraction_of_range, cumulative_fraction, estimated_height_m }` for
display in the UI alongside the raw tidal data. Returns `None` when tidal data is absent.

### 5. Tidal gate detection — PostGIS proximity + slack window

`TidalService.tidal_gates_for_day(day: Day, route_points: list[Point]) -> list[dict]`

For each point on the day's route:
- Query `TidalStation` records within 5 km using PostGIS `ST_DWithin`.
- For each matching station, look up the stream entry for the hour the paddler is
  expected to be there (derived from `day.date`, `day.start_point_id` time offset, and
  `itinerary.avg_speed_knots`).
- Flag the passage as a *tidal gate* warning if the stream rate at that hour exceeds
  `2.0 knots` (configurable) — most kayakers cannot make headway against faster streams.
- Slack water window: stream entries where `spring_rate_knots < 0.5` define the safe
  transit window. The warning includes the next slack window time.

This service method returns a list of warnings surfaced on the day detail panel and as
marker annotations on the itinerary map.

### 6. leaflet-velocity map layers — wind and swell primary, tidal stream on demand

`leaflet-velocity` (already installed) drives animated overlays on the itinerary map.
Wind and swell are the primary visual output of M5, targeting a Windy-like animated
particle flow where speed and direction are immediately legible without reading numbers.

**Layer priority and defaults**

| Layer | Source | Default | Endpoint |
|-------|--------|---------|----------|
| Wind (animated particles) | `WeatherState.wind_force` / `wind_direction` | **On** | `/api/day/:id/wind-vectors?hour=:hour` |
| Swell (animated particles) | `SeaState.swell_wave_height` / `swell_wave_direction` | **On** | `/api/day/:id/wave-vectors?hour=:hour` |
| Tidal stream (animated particles) | `TidalStation` / `TidalStreamEntry` | On when stations present | `/api/day/:id/tidal-stream-vectors?hour=:hour` |

**Tidal stream layer — two data sources, one layer**

The tidal stream animated layer is driven by whichever source is available, in priority
order:

**Source 1 — `TidalStation` / `TidalStreamEntry` (hydrographic, highest accuracy)**
Admin-seeded from published tidal stream atlases (UKHO, NOAA, SHOM). When one or more
stations exist within the day's bounding box, their per-hour vectors (direction +
interpolated rate at the day's neap/spring ratio) are synthesised into a local velocity
grid and animated on the map. This is spatially precise: each station covers its specific
passage, and multiple stations in range produce spatially varying vectors.

**Source 2 — `Sea` manually entered stream fields (crew knowledge / pilot book)**
Not every stretch has `TidalStation` coverage. A paddler with a tidal atlas, pilot book,
or direct knowledge of the area can enter the key stream parameters directly on the day's
sea record. Four new nullable fields are added to `Sea`:

- `flood_direction_degrees` — direction the stream flows *towards* during flood (0–360).
- `ebb_direction_degrees` — direction during ebb (often ~180° opposite, but not always).
- `max_spring_rate_knots` — peak rate at spring tides.
- `max_neap_rate_knots` — peak rate at neap tides (nullable; falls back to spring rate).

With these fields plus the existing `high_tide`, `low_tide`, and `tidal_range_m`, the
`TidalService` can derive the rate and direction at any hour using the rule of twelves and
the neap/spring interpolation already defined in §1. The animated layer covers the entire
day's bounding box with a uniform vector field (one direction and rate for the whole
stretch), clearly distinct from the spatially varying `TidalStation` output.

The UI labels the source on the map layer and in the detail panel:
- `TidalStation` data → "Tidal stream data from atlas"
- Manual `Sea` fields → "Tidal stream data: manually entered (atlas / local knowledge)"

**Priority / fallback chain for the tidal-stream-vectors endpoint:**
1. `TidalStation` records within bounding box → use per-station hydrographic vectors.
2. `Sea.flood_direction_degrees` + rate fields present → use manual stream fields.
3. Neither → endpoint returns empty grid; layer hidden.

The OpenMeteo `ocean_current_velocity` / `ocean_current_direction` fields remain stored
in `SeaState` but are not exposed as a map layer in M5 — they are too coarse to be
meaningful for coastal kayaking planning and risk misleading paddlers near complex tidal
environments. They may be revisited in a later milestone if a use case emerges.

**Colour ramps**

- Wind: Beaufort-matched — green (B0–3) → yellow (B4–5) → orange (B6–7) → red (B8+).
- Swell: height-matched — green (< 0.5 m) → yellow (0.5–1.5 m) → orange (1.5–2.5 m)
  → red (> 2.5 m).
- Tidal stream: speed-matched — green (< 1 kn) → yellow (1–2 kn) → orange (2–3 kn)
  → red (> 3 kn, gale-force stream).

**Bounding box**: derived from the day's route points (min/max lat/lng padded by 0.5°).
OpenMeteo returns values on a regular grid; the backend interpolates to the bounding box
on the fly. Tidal stream vectors are synthesised from `TidalStreamEntry` records within
the bounding box — no pre-computed tile storage required at M5 scale.

**react-leaflet integration pattern**

`leaflet-velocity` is a vanilla Leaflet plugin with no react-leaflet wrapper. The correct
integration pattern is a `"use client"` React component that:

1. Calls `useMap()` (react-leaflet hook) to obtain the map instance.
2. Uses `useEffect` to imperatively construct `L.velocityLayer(...)` and add it to the
   map instance on mount.
3. Returns the layer instance from the effect cleanup so it is removed on unmount or when
   props change.
4. Returns `null` from render — the component produces no DOM output of its own.

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
    // @ts-ignore — no official @types/leaflet-velocity package
    const layer = (L as any).velocityLayer({ displayValues: true, data, ...options })
    layer.addTo(map)
    return () => { map.removeLayer(layer) }
  }, [map, data, options])
  return null
}
```

This pattern is the standard approach for any vanilla Leaflet plugin in react-leaflet and
must not be varied (e.g. direct DOM manipulation, ref-based imperative access) — doing so
breaks react-leaflet's internal layer lifecycle management.

### 7. UI visual language — conditions display

Text-only display of weather and sea data is insufficient for field use. Conditions are
visually encoded at every level of the UI: day strip chips, the per-day detail panel, and
the map.

**Icon sources — Lucide is the primary library; no additional library added in M5**

Lucide (already installed) covers all condition state icons needed for a sea kayaking
planning app:

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
| Wind (general) | `Wind` |
| Waves / sea state | `Waves` |
| Temperature | `Thermometer` |

Lucide's condition icons are static SVG. Animated condition icons (e.g. `weather-icons`,
`react-animated-weather`) are a ~40 KB dependency that adds polish but not information.
For M5's planning focus — where the primary UI is a data grid, not a consumer forecast
card — static icons are sufficient. Revisit for the landing page hero or expedition
overview card if animation is needed in a later milestone.

**Wind direction — day strip chips use a rotating arrow**

In compact chip contexts (day strip card) where space is limited, wind direction is shown
as a `Navigation2` icon CSS-transformed to the bearing (`transform: rotate({deg}deg)`)
paired with a Beaufort severity pill. Communicates direction at a glance; the pill carries
the speed signal.

**Wind speed — detail panel uses wind barbs (custom SVG component, no library)**

In the per-day detail panel's hourly grid, wind speed is encoded using **wind barbs** —
the meteorological and nautical standard used on GRIB viewers, weather fax charts, and
coastal forecasts. BCU/ACA-trained paddlers read barbs intuitively; they require no
legend once familiar.

Barb anatomy:
- Shaft points in wind direction (from origin — wind from SW, shaft points NE).
- Full barb (feather) on the tail = 10 knots.
- Half barb = 5 knots.
- Triangle pennant = 50 knots.

Implementation: a `WindBarb` React component (~60 lines) generates the barb SVG
programmatically from `(directionDeg, speedKnots)`. No external library. The component
is co-located at `components/weather/wind-barb.tsx` and reused in the detail panel only
(not in chips — too small a canvas).

**Beaufort scale — semantic severity pill**

Wind force is displayed as a coloured pill showing the Beaufort number (B0–B12). Beaufort
is the language sea kayakers and coastal sailors use operationally. Colour bands:

| Beaufort | Band | Semantic token |
|----------|------|----------------|
| 0–3 | Calm / light / gentle / moderate | green |
| 4–5 | Fresh / strong breeze | yellow |
| 6–7 | Near gale / gale | orange |
| 8+ | Strong gale and above | destructive (red) |

Token colours are defined via the design token system (`lib/tokens.ts` + CSS custom
properties) — not hardcoded hex. Subject to visual correction once applied in the UI.

Conversion from m/s or km/h (OpenMeteo output) to Beaufort is a pure utility function in
`lib/weather/beaufort.ts`, applied at display time. The same function drives the
leaflet-velocity wind layer colour ramp.

**Wave height — severity colour coding (WMO sea state scale)**

| Height | WMO condition | Token |
|--------|---------------|-------|
| < 0.5 m | Calm / glassy | green |
| 0.5–1.5 m | Slight / moderate | yellow |
| 1.5–2.5 m | Rough | orange |
| > 2.5 m | Very rough / high | destructive |

These thresholds align with what sea kayakers classify as manageable (< 1.5 m) vs
challenging (> 1.5 m) vs dangerous (> 2.5 m). Colours are subject to correction once
applied in the UI; the thresholds are fixed to the WMO scale and are not adjusted.

Wind-wave height and swell height are displayed separately in the detail panel — they are
distinct phenomena and paddlers need to see both (a 0.8 m wind chop on top of a 1.8 m
swell from a distant storm is a different situation from either value alone).

**Day strip chips (§6)**

Each chip in the day card footer combines icon + value with severity colour. Three chips
maximum per card:

| Chip | Icon | Content |
|------|------|---------|
| Wind | `Navigation2` rotated to bearing | Beaufort pill (B-number + colour band) |
| Wave | `Waves` | Combined height (wind-wave + swell), coloured by severity |
| Tide | `ArrowUp` / `ArrowDown` (flood/ebb) | `HW HH:MM` or `LW HH:MM` |

Chips are compact (10 px text, `bg-muted` pill). If all three values are absent (no data
fetched yet or fetch failed), the chip section is hidden entirely — no "No data" placeholder.
Individual absent values within an otherwise populated chip set show `—`.

**Detail panel time-series (§7)**

A **horizontally scrollable compact data grid** — one column per hour. No chart library
introduced in M5; the grid provides information density comparable to a nautical weather
fax without a dependency and loads faster on slow connections at sea.

Each column contains:
- Time (HH:MM)
- `WindBarb` SVG (direction + speed in one symbol)
- Beaufort pill
- Precipitation icon (shown only when > 0 mm)
- Temperature (°C)
- Wind-wave height (coloured by severity) + wave period
- Swell height + swell direction arrow + swell period

Wind-wave and swell are shown as separate rows to preserve the distinction. The grid
renders client-side only (data fetched lazily via `useEffect`).

If/when full trip analytics are introduced (M7+), a charting library (e.g. Recharts) can
be evaluated then. The data grid covers the M5 use case.

**Tidal gate warnings — visual treatment**

Tidal gate warnings in the detail panel use `AlertTriangle` (Lucide, orange) for blocking
gates (`isBlocking: true`) and `Info` for informational warnings. Blocking gate rows
carry an orange background highlight — consistent with the Beaufort and wave severity
colour language.

---

## Consequences

**Positive**
- OpenMeteo is free, has a clean REST API, and covers the coastal regions most kayakers
  paddle — no paid dependency introduced.
- Rule of 12s as a service calculation keeps the schema clean; display can be formatted
  any way the UI needs without schema migrations.
- Tidal stream model (`TidalStation` + `TidalStreamEntry`) is grounded in the same data
  format that published tidal stream atlases use — easy to seed from UKHO/NOAA publications.
- Flask-Caching (Redis DB 1) amortises OpenMeteo API calls across page loads; a 6-hour
  TTL is appropriate for day-planning granularity.
- PostGIS proximity query for tidal gate detection reuses the existing PostGIS dependency
  (ADR-002) — no new spatial infrastructure.

**Negative / trade-offs**
- Tidal times (`high_tide`, `low_tide`, `tidal_range_m`) are manually entered in M5 —
  this places a burden on the trip leader to consult an almanac. Automated prediction is
  achievable without a paid API (see §2 above: pyTMD + FES2022/EOT20, or national-
  authority APIs for US/France/Nordics); it is deferred, not blocked.
- OpenMeteo ocean current vectors are global model output (CMEMS/GFS), not measured data.
  In complex tidal environments (estuaries, archipelagos), they diverge from actual stream
  atlases. The `leaflet-velocity` overlay is indicative; `TidalStreamEntry` data is the
  authoritative source for tidal races.
- `SeaState` gains two new columns (`current_speed`, `current_direction`) — the current
  schema uses a composite primary key `(day_id, time)`; the columns are nullable, no
  existing data is affected.

**Risks / open questions**
- OpenMeteo's ocean current coverage is incomplete for some shallow coastal areas (shelf
  seas with complex bathymetry). Where data is absent the current-vector endpoint returns
  an empty grid; the `leaflet-velocity` layer renders nothing — this is acceptable.
- Seeding `TidalStation` data from UKHO/NOAA requires manual digitisation or a bulk import
  script. The bulk import path (CSV from published atlas tables) should be implemented as a
  management command before the feature is usable in production.
- Mean spring range (`TidalStation.mean_spring_range_m`) may be absent for community-
  contributed stations. When absent, the neap/spring interpolation falls back to the spring
  rate — conservative but adequate.
- Tidal gate detection assumes constant speed (`avg_speed_knots`) along the route leg.
  Mid-leg speed variations (stops, headwinds) are not modelled. Treat warnings as
  planning guidance, not hard gates.
