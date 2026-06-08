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

### 2. Tidal times and range — manual entry in M5; automated prediction deferred

**Why OpenMeteo cannot drive the rule of 12s**: OpenMeteo's marine API provides wave data
and `ocean_current_velocity` / `ocean_current_direction` from a global circulation model
(CMEMS/GFS). These are current speed in knots — not tidal heights in metres. The rule of
12s needs HW/LW times and a height range; neither exists anywhere in OpenMeteo's output.
Even if peak-current timing were extracted from the hourly velocity series, the signal
mixes tidal, wind-driven, and geostrophic components at 5–25 km grid resolution — far too
coarse and mixed to recover reliable HW times at the scale of a tidal passage. OpenMeteo's
current vectors are used only for the indicative `leaflet-velocity` overlay; they must not
be confused with tidal prediction data.

**Free automated prediction is achievable without a paid API** through two tiers:

*Tier 1 — Global harmonic grid models (full global coverage, ±5–20 cm accuracy offshore):*
- **FES2022 / FES2014b** (AVISO+, LEGOS/CNES) — free after non-commercial registration;
  ~1/16° global grid; Python access via `pyTMD` or `pyfes`; ~30 GB server-hosted model
  files.
- **EOT20** (DGFI-TUM) — fully open license, published on Zenodo; slightly coarser than
  FES2022; same `pyTMD` access path. No registration required.
- **TPXO9-atlas** (Oregon State University) — free for non-commercial/academic use; widely
  used in research; also accessible via `pyTMD`.
- **`pyTMD`** is the Python package that unifies all three: given (lat, lon, datetime) it
  returns predicted tide height, from which HW/LW times and range are derived.

*Tier 2 — National authority free APIs (gauge-calibrated, higher accuracy, limited
coverage):*

| Authority | Waters | Notes |
|-----------|--------|-------|
| NOAA CO-OPS | US, Caribbean, Pacific territories | Public REST API, no key |
| SHOM | France, DOM/TOM | Open data portal; forecast API needs a free key |
| SMHI | Sweden | Open data API, free |
| MET Norway | Norwegian coast | Free API |
| DMI | Denmark, Greenland | Partially free via DMI open data |
| Waterinfo.be | Belgium | Free REST API |

The UK gap: UKHO charges for tidal prediction API access. NTSLF publishes observed gauge
data free but not predictions. Harmonic constants for UK ports are in Admiralty products
not freely redistributable. The global grid models (FES2022, EOT20) are the practical
fallback for UK coastal waters; accuracy degrades in shallow shelf seas and sea lochs.

**Architecture for the automated prediction pipeline (deferred to post-M5):**
1. Add `Sea.tidal_source` nullable enum: `"manual"`, `"predicted_noaa"`,
   `"predicted_shom"`, `"predicted_grid"` — so the UI labels where data came from and
   lets the leader override.
2. The existing Celery task triggered by `apply-boundaries` (OpenMeteo fetch) is the right
   place to also run tidal prediction for the day's coordinates.
3. Task priority: try NOAA CO-OPS first (US bounding box), then SHOM (France), then fall
   back to `pyTMD` + FES2022/EOT20 for all other regions; leave null if model coverage is
   absent.
4. The model files (FES2022/EOT20) are server-hosted one-time downloads. `pyTMD` supports
   subset downloads limited to a bounding box to reduce storage.
5. Manual entry remains the first-class path: leaders with access to a local almanac or
   chart table should always be able to override automated predictions.

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

### 6. leaflet-velocity overlay — ocean current vectors from OpenMeteo

OpenMeteo's `ocean_current_velocity` and `ocean_current_direction` fields (hourly) are
stored in `SeaState` (two new columns: `current_speed` and `current_direction`) alongside
wave data.

The `/api/itinerary/:id/current-vectors?dayId=:dayId&hour=:hour` endpoint returns a
GeoJSON-compatible grid of current vectors for the day's bounding box at the requested
hour. The `leaflet-velocity` layer on the frontend consumes this grid.

**Bounding box**: derived from the day's route points (min/max lat/lng padded by 0.5°).
OpenMeteo returns values on a regular grid; the backend interpolates to the bounding box
on the fly (no pre-computed tile storage required at M5 scale).

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
