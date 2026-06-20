---
id: itinerary-frontend
title: "Itinerary & Frontend: Map-First UX, Next.js Architecture & the Builder Evolution"
abstract: Map-first itinerary building (react-leaflet), Next.js 16 App Router with server actions, unified view/edit modes, drag-boundary day assignment, tile caching with OpenSeaMap priority, and GPX import/export.
status: accepted
date: 2026-06-10
deciders: []
tags: [frontend, map, itinerary, tiles]
---

# Itinerary & Frontend: Map-First UX, Next.js Architecture & the Builder Evolution

This document covers the frontend architecture and all decisions shaping the itinerary building experience — from the founding principle that the map is the primary surface, through the Next.js structural choices, to the detailed evolution of the itinerary builder across M4 and M4b.

---

## Map-first — the founding principle

The core UX of the application is planning a kayak expedition route. A form-first approach (entering coordinates or place names into fields) was considered and rejected. **The itinerary builder is map-first**: the map canvas is the primary interaction surface, and points are created by clicking the map.

This matches how experienced kayakers actually plan. Paddlers make go/no-go decisions by **inspecting satellite imagery**: reading coastline detail, identifying landing beaches, spotting hazards, and assessing exposure. This is a primary planning activity, not an afterthought — the map layer is functional, not decorative.

**Backend contract**: the backend is intentionally map-SDK-agnostic. It stores raw WGS84 coordinates (`lat`, `lng`) and geometry (`Geography(Point, 4326)`). The API never references Leaflet, Mapbox, or any other SDK. This preserves freedom to change the map SDK on web or use a different one on mobile without any backend changes.

The web client uses Leaflet (`react-leaflet`) with `leaflet-velocity` for wind and current overlays (M5). The mobile client (M9) uses **MapLibre React Native** (`@maplibre/maplibre-react-native`) — the open-source fork of the Mapbox RN SDK taken before Mapbox went proprietary in 2021. It provides native GL rendering, custom XYZ tile URL support (pointing at our own MinIO proxy and titiler), and built-in offline region download, with no usage fees or vendor lock-in. These SDKs never leak into shared data models or the API contract.

---

## Next.js App Router with server actions

Auth is done via httpOnly cookies (see `foundation.md`), which requires a server layer. A pure SPA cannot set or read httpOnly cookies. This rules out Vite SPA; Remix was evaluated but Next.js App Router was chosen for its server-component-first model and React 18 concurrent features.

**Next.js 16 App Router** with server components for data fetching and server actions for mutations:

- Route groups `(auth)/` and `(app)/` separate unauthenticated and authenticated layouts.
- Server components fetch data directly — no client-side fetch waterfalls for initial page load.
- Mutations use server actions (`"use server"`) — the token never leaves the Next.js server, no CORS issues.
- Client components (`"use client"`) are used only where interactivity is required: forms, map canvas, drag-and-drop.

Any browser-to-Flask fetch that bypasses server actions will hit CORS. This is an architectural invariant enforced in code review — all sensitive calls (auth, profile mutations, GDPR) must go through server actions.

Known issue: hydration mismatches occur when browser extensions (password managers) inject DOM nodes that differ from SSR output. React 19 auto-recovers; `suppressHydrationWarning` is applied on affected containers. Fix before production launch.

---

## Trip detail page structure

As the trip detail page accumulated sections (crew, logistics, documents, shuttle, itinerary, inventory) it became an unbounded vertical scroll. The structure was redesigned as a **compact overview card plus a tabbed checklist card**.

### Overview card (slim)

Trip name, dates, difficulty, description, state badge, trip progression indicator. State transition button (leader-only). Leader-only actions (Float plan, Delete trip). Target: no more than 40% of the initial viewport.

### Tabbed checklist — five tabs

| Tab | Content |
|-----|---------|
| **Itinerary** | Stats summary + "Open itinerary →" link (default open tab) |
| **Crew** | Crew list + pending invitations + inline metadata editor |
| **Float Plan** | Float plan leader view (leader-only tab) |
| **Logistics** | Accordion: Shore Contact · Travel Documents · Shuttle |
| **Gear** | Inventory and gear (M6) |

Tab state is persisted in the URL as `?tab=<name>` so links are shareable and browser back/forward works correctly.

**Itinerary tab content** (not an embedded map):
```
14 days · 180 nm · ~6h avg/day · 8 stops
May 31 → Jun 13
──────────────────────────────
Day 1   Ribadeo → Foz      12 nm  5h 10min
Day 2   Foz → Burela        9 nm  3h 48min
Day 3   Rest day
...                         [Show all ↓]
──────────────────────────────
[Open itinerary →]
```

An embedded map on the trip detail tab signals "interact here" — the wrong affordance for a planning overview. Stats are faster to parse on mobile and avoid Leaflet's SSR/dynamic import complexity. Deep interaction belongs in `/itinerary/[id]`.

**Field removal** (M3f): `Logistics.departure_point`, `arrival_point`, and `travel_notes` were removed — they duplicated itinerary endpoint data and were an unstructured catch-all with no clear owner.

**State-aware landing**: when a trip is `happening`, the `/trips/[id]` server component redirects immediately to `/itinerary/{trip.itinerary.id}` (view mode, today's card highlighted). No middleware, no client-side routing — a single conditional redirect. The trips list promotes the active `happening` trip as a hero card that navigates directly to this path.

---

## Itinerary page — unified view and edit modes

`/itinerary/[id]` serves both planning and happening contexts via two modes on the same page. There is no separate "day plan" route.

**View mode** (default on entry):
- Full-bleed map with day colours.
- Slim vertical day rail (left edge, ~112 px). Each entry shows: day number, date, Bft pill
  (derived from `wind_speed_10m` in the day's `Weather` record), point count. Bft colour
  bands: 0–3 green · 4–5 amber · 6–7 orange · 8+ red. Missing values render as meaningful
  placeholders rather than a bare dash — "Add date" (no date), "No forecast" (not yet
  fetched), "No points". Every numbered day is listed; a day with zero assigned points is
  shown greyed and disabled (not selectable) so the day's existence is visible without
  implying it has a route yet.
- Selecting a day opens a **feature drawer** (right panel, ~264 px, slides in). Three tabs
  in order: **Route | Forecast | Tides** (see "Viewing mode — feature drawer" below).
- Confirmed day boundaries visible in `PointListPane` as non-interactive dividers (day
  label, date, distance). These are always present — not hidden behind a button.
- During `past`: edit mode locked; drawer tabs are read-only.

**Edit mode** (leader-only during `building` and `happening`):
- The full M4b builder: PointListPane, drag-boundary editor, point dropping.
- Entry: `[Edit]` button in the top bar (or `[+ Add day]` which enters edit mode implicitly).
- Confirmed boundary dividers become draggable in place — same visual, now interactive.
- Exit: `[Apply]` commits via `apply-boundaries` and returns to view mode.
  `[Cancel]` discards draft and returns to view mode.
- During `past`: edit mode locked.

**Header states — PointListPane**:

| Condition | Header |
|-----------|--------|
| `days.length === 0` | `[+ Add day]` only |
| `days.length > 0`, view mode | `[Edit]` · `[+ Add day]` |
| Edit mode active | `[Apply]` · `[Cancel]` |

`[+ Add day]` from view mode enters edit mode then places the new handle. From edit mode
it places another handle without exiting draft. Delete-day is no longer in the header — it
lives on each BoundaryDivider in edit mode (generalised from "delete last" to "delete by
dayId"). **Day 1 is the permanent anchor**: it renders as a static header at the top of
`PointListPane` (not a `BoundaryDivider`) and has no delete control, so once any day exists
the itinerary cannot be reduced below Day 1. Deleting a later day reassigns its points to
the preceding day.

**Boundary handle = Day 1 header, made draggable.** A `BoundaryDivider` in edit mode is a
full-width bar visually identical to the static Day 1 header (`Day N · date · distance`).
Drag-to-reassign is confined to a small grip icon on the left; the rest of the bar (date
picker, delete button) receives normal clicks. Confining the pointer-capture region to the
grip is what lets the inline date picker work — previously the whole pill captured pointer
events and swallowed the picker's clicks.

**Date display and editing are unified app-wide.** All day dates (Day 1 header, boundary
dividers, day rail) and trip date ranges use the shared `DatePicker` (shadcn Popover +
Calendar) for editing and the `d MMM yyyy` format (`formatDayDate`, date-fns) for display.
This replaces the native `<input type="date">` (browser-locale-dependent, rendered
mm/dd/yyyy for some users) and an interim DD/MM/YYYY text input. The calendar widget is
locale-independent and always visible.

**New handle placement**: when `[+ Add day]` is clicked, the new boundary is inserted at
the midpoint of the last day's point range (`floor((startIdx + endIdx) / 2)`). The list
auto-scrolls to show the new handle. If the last day has only one point the boundary lands
immediately below it (zero-point new day; user must drag to assign at least one point —
same constraint as today). No ghost divider is used: the handle is a standard
interactive `BoundaryDivider` from the moment it appears.

Planning and happening are not distinct phases — a paddler adjusts the route throughout
the expedition. One page, one bundle, one set of tests.

**Point detail — zoom-and-sheet interaction**: tapping a waypoint in the Route tab triggers
a map `flyTo` and opens `PointDetailSheet` — a slim bottom sheet (positioned between the day
rail and the feature drawer) showing the point name, type, and three tiles: Distance
(read-only cumulative), Notes, Images. Tapping the Notes or Images tile opens the
**point detail modal** (see below). The earlier all-in-one M4b sheet was reworked into this
summary-tiles form so the deep content lives in the modal.

---

## Viewing mode — feature drawer (M4c)

Replaces `DayStrip` (horizontal bottom carousel) and `DayDetailPanel` (bottom accordion).
The bottom of the map is kept free for the map canvas and the velocity overlays (M5 §8).

### Feature drawer tabs

**Route** — ordered waypoint list for the selected day. Each row: type icon, name,
cumulative distance from day start, chevron. Tapping opens the `PointDetailSheet` bottom
sheet (see "Point detail" above).

**Forecast** — read-only data, leader-triggered fetch. Populated from the day's `Weather`
and `Sea` records via the shared `useDayConditions` hook (`lib/weather/use-day-conditions.ts`,
also used by the trip-detail conditions section).
- Wind & atmosphere: wind speed/direction, temperature, cloud cover, precipitation.
- Sea state: wave height/period/direction, swell height, ocean current.
- Hour slider in the drawer header controls the time slice for the map velocity overlays
  and the data displayed; always visible regardless of which tab is active.
- **Fetch in view mode**: when no forecast exists, the empty state shows a leader-only
  "Fetch forecast" button (hidden for crew and for `past` trips); when data exists, a
  "Refresh forecast" affordance. Both call `triggerWeatherFetch` and poll until the Celery
  task lands data. On success the hook bumps `MapBuilderContext.conditionsVersion` so the
  day rail re-reads its Bft pills.

**Tides** — mixed editable/read-only.
- *Parameters* (editable): data source toggle (tide atlas from nearest station / manual),
  HW time, HW height (m), springs–neaps coefficient (0–1 slider). Changes `PATCH`
  to `/api/day/:id/sea`.
- *Tidal gates* (read-only, calculated): fetched from `GET /api/day/:id/tidal-gates`.
  Each gate shows passage name, slack time, and offset from HW in human-readable form.
  Re-fetched after each parameter save.

### Point detail modal

Triggered from the Notes or Images slot in `PointDetailSheet`. Both slots open the same
modal — no separate images-only lightbox.

- Full-overlay `Dialog` (`z-[2000]`); shadcn `Dialog` handles focus trap and Escape.
- Header: point name, type badge, coordinates (`lat°N · lon°E`).
- Upper half (~42 %): image carousel. Prev/next chevrons; dot indicators; count badge.
  Empty state when no images — no carousel rendered.
- Lower half: `<textarea>` for notes with expedition-context placeholder.

The point name and coordinates in the header serve as spatial orientation while writing
notes or reviewing photos — the user never loses context of which waypoint they are on.

---

## The itinerary builder — route-first model (M4)

### Route-first, not day-first

The fundamental mental model is **route-first**: the user drops all points onto the map as one continuous route, then divides into days by bracketing sections in the sidebar. This matches how experienced paddlers plan on paper or chart-table — feasible stopping points emerge from tracing the coast, not from deciding day lengths upfront.

### Day 0 as a staging area

All newly-dropped points are assigned to `Day 0` (`day_number = 0`) at creation time. Day 0 is an internal implementation detail — never visible in the UI as a named day. It is created automatically in the same database transaction as the itinerary.

- `GET /api/day/itinerary/:itineraryId` filters out `day_number = 0`.
- The map builder endpoint exposes Day 0 via an `include_staging = True` flag on `ItinerarySchema`. All other callers receive the schema without the flag and Day 0 is stripped by `@post_dump exclude_day_zero`.

Unassigned points render as grey markers. As points are bracketed into numbered days they take on the day's colour.

### start_point_id / end_point_id on Day

A boundary point (the end of Day N / start of Day N+1) belongs to Day N and is **not** duplicated. Day N+1 references it via two nullable FKs:

| Column | Type | Notes |
|--------|------|-------|
| `start_point_id` | `UUID NULL FK → point.id` | First point of the day's leg |
| `end_point_id` | `UUID NULL FK → point.id` | Last point of the day's leg |

All point data (coordinates, notes, images, type) lives exactly once in the `point` table. The FKs are pure references.

### Draft persistence — no status field

Every mutation is persisted immediately via server actions. The itinerary has no `is_draft` field. Draft detection is a frontend-only heuristic: if `days.length === 0` (no numbered days have been assigned), the itinerary is in draft state and the trip detail tab shows "Draft — continue in map builder."

### Hover-slide day bracketing (M4, superseded by drag handles in M4b)

The original M4 bracketing interaction: the sidebar shows day cards with `START` / `END` slots. In Assign days mode, the user clicks a start marker and hovers along subsequent markers; each hovered marker progressively colours with the day's colour. Clicking locks the end. Per-day `Save/Cancel` cycle.

This was replaced in M4b because of reliability problems (see below).

---

## Itinerary builder redesign (M4b)

Several reliability problems emerged from the M4 hover-slide implementation:

1. **Stale stop markers**: reassigning a boundary never reset the old endpoint's `type` back to `position`.
2. **Adjacent-day sync gap**: `handleSaveSlide` updated one day's `startPointId` but not the adjacent day's `endPointId`.
3. **Fragmented state across slide cycles**: a Cancel on one day did not restore what an adjacent day's earlier slide changed.
4. **Mode-switch friction**: the explicit Drop ↔ Assign toggle required switching back to add a missed point mid-assignment.

The redesign addressed all four by architectural means — not by fixing each bug individually.

### One unified builder — mode toggle removed

The explicit Drop points / Assign days mode toggle is removed from the top bar. The map is always in drop mode: clicking places a point; dragging moves it. Boundary editing happens exclusively in the sidebar drag handles. Map markers return to a single meaning — the mode conflict is eliminated entirely.

### Unified sidebar — PointListPane

A single `PointListPane` replaces `DropSidebar` and `DaySidebar`. It renders the route as a vertical ordered list of point rows — the same list in both contexts.

**Point row format**: ordinal index + name if present — `12 (Cedeira harbour)` or `12`. Four-pixel day-colour strip on the left, type icon (anchor = stop, dot = position, star = interest) on the right.

**Type is always editable in the sidebar** regardless of context. The only exception: boundary points (type locked to `stop`). The map and any floating panels are not editing surfaces — the sidebar is.

**Drop context auto-expand**: when the user clicks the map to drop a point, the new row auto-expands in the sidebar with type selector and name field ready. The `PointDropPanel` floating chip card from M4 is removed — fully absorbed into the sidebar row.

### Drag-handle boundaries editor

Day boundaries are horizontal divider lines inserted between point rows. Each divider carries a **day-pill handle** (day number, date, grip icon) as the sole drag target.

- `pointerdown` → pointer capture → `pointermove` updates `endPointIdx` in draft state → `pointerup` releases.
- During drag, map polylines recolour immediately from `previewDays` draft state. The map is passive — colours are output of sidebar decisions.
- A boundary cannot be dragged above the previous day's boundary (minimum 1 point per day). If a drag gesture pushes boundary N against N-1, they move as a rigid unit (chain drag); they decouple when the gesture moves back down.
- **Apply / Cancel**: a persistent Apply button commits all draft boundaries atomically. Cancel discards the draft entirely. No per-day Save/Cancel cycle.

### Atomic boundary application — batch endpoint

```
POST /api/itinerary/:id/apply-boundaries
Body: {
  boundaries: [{ dayId, startPointId, endPointId, date }],
  points: [{ id, type, name }]
}
```

Replaces the cascade of per-day `SLIDE_COMMIT`, `POINTS_ASSIGN`, and `DAY_UPDATE` actions. The backend executes in a single database transaction: reassigns all points to their new days, applies type resets (old stops that are no longer boundaries → `position`), applies all dirty name/type fields. Eliminates the stale-stop and adjacent-day sync bugs by construction — there is no intermediate state.

Outside boundary-edit mode, individual point changes continue to save immediately via `PATCH /api/point/:id`.

### React context — MapBuilderContext

The `MapBuilder` component owns `mapReducer` state, draft boundary state, and `avg_speed_knots`. Rather than prop-drilling through `PointListPane → point rows → expanded accordions → boundary handles`, a `MapBuilderContext` is provided by `MapBuilder` and consumed via `useMapBuilder()`. Tests wrap components in `<MapBuilderProvider value={...}>`.

Values that are local to a component subtree (expanded accordion item, scroll position) remain as props.

---

## First-class itinerary (M4b)

`trip_id` becomes nullable on the `itinerary` table. An itinerary can be created without a trip, assigned to a trip later, or used to create a new trip from scratch.

- `/itinerary` — listing page, sidebar nav item.
- `/itinerary/[id]` — the map builder, directly accessible and bookmarkable without navigating through the trip detail page.
- `itinerary.name` — required field. Defaults to trip name when created from a trip; trip name defaults to itinerary name when a trip is created from an itinerary. Independent after initial default.
- `itinerary.user_id` is **never cleared** through any trip state transition. An earlier implementation cleared `user_id` on `happening`, causing the itinerary to vanish from the owner's listing. Ownership and edit permission are separate concerns; clearing ownership FK is not a mechanism for locking edits.

---

## Other M4b decisions

**Estimated paddling time**: `avg_speed_knots` (float, default 2.5 knots) stored on `itinerary`. Leg label format: `4.2 nm · 1h 41min`. Day pill shows total distance + total paddling time. M4 unit toggle: nm default, km available.

**Consecutive dates with rest-day gaps**: day-pill handles display and accept a date. Dates default to consecutive calendar days from `trip.startDate`. A gap of more than one calendar day between consecutive days is a planned rest — boundary editor shows a visual gap indicator. A date change by the paddler mid-expedition is a schedule rebase (not a pause, not a checkpoint alarm). `is_paused` and a date change are different signals and must not be conflated in alert logic.

**Photo-level public visibility**: `Image.is_public` boolean added. When an itinerary is made public, the owner marks individual photos public during the publish flow. Only those photos appear in the public read shape. Point notes are always excluded from the public representation.

**GPX import/export**: `GET /api/itinerary/:id/export?format=gpx` returns a GPX file with `<rte>` preserving point names, types, and day boundary metadata. `POST /api/itinerary/import` (multipart) accepts `<rte>` or `<trk>`, parses to Day 0, returns the new itinerary ID. `gpxpy` handles both directions; file size limit and error handling for malformed XML are required. GPX import of recorded tracks with thousands of trackpoints requires a Ramer-Douglas-Peucker simplification pass on import (tolerance slider in the import dialog; default TBD).

**Community route library**: `/explore` page + landing page map show all public itineraries without authentication. "Use this route" creates a private fork. `created_from_id` on the copy tracks lineage for attribution. Explore-surface deduplication uses Leaflet marker clustering on spatially overlapping routes — no DB deduplication (data is trivially small; premature complexity). A small set of admin-seeded routes makes the explore surface immediately valuable before the community grows.

---

## Tile caching architecture

Two distinct cache layers serve different purposes and must not be conflated:

**Layer 1 — Server tile proxy (MinIO)**: tiles fetched from OSM (and rendered from Sentinel-2 COGs via titiler) are cached in MinIO and served from our own origin. This eliminates OSM direct-request dependency (OSM terms require high-traffic apps to use a CDN or own tile server), enables future server-side thumbnail generation, and feeds the device download for offline use.

**Layer 2 — Device tile cache (client-local)**:
- Web (PWA): Service Worker + Cache API. User triggers "Download for offline" before departure. Tiles for the route corridor bounding box at zoom levels 8–15 are cached. Best-effort; storage limits and eviction are not guaranteed.
- Mobile M9 (React Native): device filesystem cache, explicitly downloaded and managed by the app via MapLibre's offline region API. More reliable; user-controlled. Tile source is our MinIO proxy — same origin as web.

**Tile sources — priority order**:

| Priority | Layer | Source | Access model | Resolution | Who |
|----------|-------|--------|--------------|------------|-----|
| 1 | Base map | OpenStreetMap | Cached in MinIO via nginx/Flask proxy | — | All users |
| 2 | **Nautical charts (OpenSeaMap)** | OpenSeaMap tile overlay | Free transparent XYZ overlay on OSM; cached in MinIO | — | All users |
| 3 | Satellite | Sentinel-2 L2A (Copernicus/ESA via AWS Open Data) | Rendered by titiler sidecar; cached in MinIO | 10 m | All users |
| 4 | Satellite HD | Mapbox Satellite | Direct client↔Mapbox fetch; no server cache | < 1 m | Premium users |

**OpenSeaMap is the highest-priority addition after the base map.** Sea kayak planning depends on seamark data — buoys, rocks, depth contours, tidal diamonds, restricted areas — that OSM base tiles do not provide. OpenSeaMap is a free, community-maintained nautical chart overlay served as a standard XYZ tile URL (`https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png`). Zero infrastructure cost; a single transparent overlay layer in react-leaflet. This must land before the Sentinel-2 or Mapbox integrations, which serve secondary use cases (coastline imagery and sub-metre inspection respectively).

**Layer toggle in the UI**: OSM base is always on. OpenSeaMap is on by default. Satellite (Sentinel-2) and Satellite HD (Mapbox) are optional overlays for users who need imagery, toggled via the layers control. The layers control UI is the same component for web and the future mobile map.

**Sentinel-2 + titiler** covers route-level coastal planning (distinguishing beach from rocks, reading headland exposure). This is the Sentinel-2 use case — meaningful once nautical seamarks are already visible and users want to cross-reference imagery. **Deferred: do not build titiler infra before validating that beta users need it over OpenSeaMap + OSM alone.**

**Mapbox HD** enables sub-metre point inspection (landing beaches, rock platforms, hazard detail) and is the primary premium value proposition. A backend endpoint issues a short-lived, referrer-domain-restricted Mapbox token for the session — ToS-compliant (Mapbox restricts caching and re-serving tiles, not brokered client-direct access). **Deferred to premium tier.**

Tile caching is shared infrastructure for M4b, M8, and M9. It should be scoped as a dedicated milestone before M8, not bolted onto any single feature.

**Static map thumbnail** (deferred past M5): a pre-rendered static image of the route (SVG polyline → PNG via `cairosvg`, stored in MinIO, no external service). Triggered by the Celery worker after every `apply-boundaries` call. No tiles required — route shape on a neutral ocean-colour background. The stats summary ships first.

---

## Tidal diamonds — drop-a-pin manual entry (M4d)

Tidal streams stop being a `leaflet-velocity` flow field (see `features.md §6a` for the full
rationale) and become **chart diamonds**: discrete ◇ markers at a real location, with a direction
arrow, a rate label, the speed colour ramp, and a faint user-configurable radius circle (default
~500 m). Click → popup with the hour-by-hour rate table.

**Entry UX**: any trip member can drop a diamond pin on the sea and enter its data in a popup, with
**simple** (peak rate + flood/ebb direction, expanded across the cycle by the rule of thirds) and
**advanced** (full atlas hour table) modes. Persisted as a trip-scoped `TidalStation`, *not* a route
`Point` — the route linked list stays clean and existing tidal-gate proximity logic picks user
diamonds up automatically. Forms follow the react-hook-form + zod + `lib/dtos` pattern.

**Tides tab**: keeps day-level height entry only (HW/LW/range, rule-of-12s table, gate warnings).
The stream-data section moves to the diamond popup. The tab is read-only for non-leaders and shows
an empty state (not a form) when no tidal data exists.

## Paddle-time legs: stop-anchored, positions aggregate

Distance/time between points was first surfaced as a per-segment label on every consecutive pair
(map tooltips while planning; route tab + point sheet in view mode). That is mechanically honest but
noisy: a detailed route has many `position` points, and a position is **geometry, not a destination**
— its only job is to bend the polyline round a headland or through a channel. You never *arrive* at
one.

**Decision: a leg runs stop-to-stop; intervening positions aggregate into the leg total.** A `stop`
is any point the planner deliberately marks for any reason — toilet, lunch, leg-stretch, or the first
point after a long crossing where you just want the elapsed time, a bar, and a breath. The leg calc
anchors on `type === "stop"` (which already includes the auto-stamped day-boundary stops) and sums
the haversine distance across all positions back to the previous stop; ETA uses the itinerary's
planning speed (`avgSpeedKnots`, the figure set in the top bar — its wording is mirrored on the leg
labels so the estimate's source is discoverable).

UI consequence: the **route tab lists stops**, each showing the leg from the previous stop, with
cumulative distance secondary. Positions drop out of the list (still visible and draggable on the
map) — a shorter, more meaningful list. The point sheet's Leg tile aggregates intervening positions
back to the last stop. Where a day has no mid-day stop, stop-to-stop collapses to the whole day,
which the `BoundaryDivider` already totals — so granular legs only earn their place once intermediate
stops exist, which is exactly when they matter.

## Point-type simplification: `interest` removed from the route

`stop` and `position` are the route. `interest` is **deprecated as a `Point` type** — POIs are not
part of the paddled line and are reintroduced as a standalone map-annotation entity (the
tidal-diamond pattern). Full design in `features.md` (Map Annotations); this is the route-model side:
the linked list and `pointOrder` carry only `stop`/`position`, and the type icon legend drops the
interest star.

## Decision log

| Decision | Original ADR | Date | Notes |
|----------|-------------|------|-------|
| Map-first itinerary building (Leaflet) | ADR-006 | 2025-01-01 | Backend SDK-agnostic; web uses react-leaflet; mobile uses MapLibre React Native (see `mobile-offline.md`) |
| Next.js App Router + server actions | ADR-008 | 2025-01-01 | httpOnly cookies require server layer |
| Trip detail tabbed layout | ADR-020 | 2026-05-11 | Partially superseded by ADR-027 on tab content |
| Route-first model, Day 0 staging, hover-slide (M4) | ADR-024 | 2026-05-19 | Hover-slide superseded by drag handles in ADR-026 |
| Unified sidebar, drag boundaries, first-class itinerary (M4b) | ADR-026 | 2026-05-25 | Supersedes ADR-024 §3 (mode-toggle), §4-sidebar, §9 (drop popover) |
| Trip detail structure, view/edit modes, tile caching (M4b) | ADR-027 | 2026-05-26 | Partially supersedes ADR-020 on tab content and ordering |
| OpenSeaMap nautical overlay — first-class layer, priority over Sentinel-2 | — | 2026-06-15 | Free XYZ transparent overlay; zero infra; must land before titiler/Sentinel-2 pipeline; Sentinel-2 deferred until beta validates need |
| Planning flow redesign: always-visible boundaries, header states, midpoint handle placement (M4c) | — | 2026-06-15 | Supersedes ADR-026/027 on boundary-edit entry UX and PointListPane header; delete-day moves to BoundaryDivider |
| Viewing mode: day rail + feature drawer, Route/Forecast/Tides tabs, point detail modal (M4c) | — | 2026-06-15 | Supersedes ADR-027 on view-mode layout; DayStrip and DayDetailPanel removed |
| App-wide date UI: shared `DatePicker` (shadcn Popover+Calendar) for editing, `d MMM yyyy` (`formatDayDate`) for display; boundary handle styled as draggable Day 1 header; Day 1 is the permanent anchor; day rail shows all numbered days with placeholders, empty days greyed/disabled (M4c) | — | 2026-06-16 | Replaces native `<input type=date>` (locale mm/dd/yyyy) and interim DD/MM/YYYY text input; drag confined to grip so inline picker works |
| View-mode weather fetch (`useDayConditions` hook, Forecast-tab fetch/refresh, `conditionsVersion` rail refresh); point detail = summary bottom sheet → full detail modal; wireframe layout parity (M4c §6–§8) | — | 2026-06-17 | Weather no longer fetchable only from edit/top-bar; `PointDetailSheet` reworked from all-in-one to tiles; matches `ItineraryLayoutWireframe` |
| Tidal diamonds: drop-a-pin manual entry (trip-scoped `TidalStation`), chart ◇ markers replace the stream particle layer, simple/advanced entry, Tides tab keeps day-level height only (M4d) | — | 2026-06-18 | See `features.md §6a`; radius user-configurable (~500 m default); panel layout siblings + carousel/slider sync also landed this pass |
| Paddle-time legs anchored stop-to-stop; positions aggregate as pass-through geometry; route tab lists stops only; ETA at `avgSpeedKnots`, wording mirrors top bar | — | 2026-06-20 | Replaces per-segment legs; a `stop` is any deliberately-marked point; collapses to day total when no mid-day stop exists |
| `Point.interest` removed from the route model; POIs become standalone map annotations | — | 2026-06-20 | Route-model side only; full entity design in `features.md` (Map Annotations); linked list / `pointOrder` carry only `stop`/`position` |
