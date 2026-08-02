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
- Entry: `[Edit]` button in the top bar.
- Boundary dividers are always draggable in Edit mode — see "Flat edit surface" (M14)
  below for the current draft/commit model (supersedes the `[Apply]`/`[Cancel]` and
  `[+ Add day]`-enters-edit-mode framing below, both stale since M12/M14).
- During `past`: edit mode locked.

**Header states — PointListPane** (superseded by M14 — see "Flat edit surface" below;
kept here only as the original M4c framing referenced by the decision log):

| Condition | Header |
|-----------|--------|
| `days.length === 0` | `[+ Add day]` only |
| `days.length > 0`, view mode | `[Edit]` · `[+ Add day]` |
| Edit mode active | `[Apply]` · `[Cancel]` |

Delete-day lives on each BoundaryDivider in edit mode (generalised from "delete last" to
"delete by dayId"). **Day 1 is the permanent anchor**: it renders as a static header at
the top of `PointListPane` (not a `BoundaryDivider`) and has no delete control, so once
any day exists the itinerary cannot be reduced below Day 1. Deleting a later day
reassigns its points to the preceding day.

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

**Point row format**: ordinal index + name if present — `12 (Cedeira harbour)` or `12`. Four-pixel day-colour strip on the left, type icon (anchor = stop, dot = position) on the right.

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

---

## Flat edit surface: implicit boundary draft (M14)

M12 (item 16, 2026-07-09) formalized boundary editing as an **explicitly-entered draft
sub-state**: a leader had to press "Edit days" before any divider became draggable, then
"Save days" or "Discard" to leave it — fixing a real bug (Add day created a real `Day` row
immediately, so Cancel left an orphaned row the user never confirmed) but at the cost of a
mode nested inside Edit mode. Living with it, the user rejected the *interaction gate*
itself: nudging one boundary by one point cost Edit → Edit days → drag → Save days → back.
M14 (2026-08-01/02) flattens this to a single edit surface while keeping the part of M12's
fix that mattered — atomic, server-side-nothing-happens-before-Save boundary commits.

**Rejected alternatives** (discussed and dismissed before settling on the design below):
- *Literal tool palette* (point tool / day tool, click to arm): tools are modes too, just
  spatial instead of temporal — trades "which level am I in?" for "which tool is armed?"
  and loses the builder's best property, zero armed tools (tap map = add point, tap
  marker = select).
- *Live per-gesture boundary commit* (no Save/Discard at all): loses Discard entirely and
  would churn stop/position type promotions into the DB on every drag sweep.

**Implicit draft, ID-anchored.** Boundary dividers are always interactive in Edit mode —
no "Edit days" button, no entry ceremony. The first boundary gesture (drag, date change,
Add day, delete day) silently materializes a draft; **Save days / Discard render
persistently** in the same header position as before, `disabled` until the draft is
dirty (a disabled→enabled transition, not an appear/disappear — deliberately chosen over
hiding them, so the affordance is discoverable before first use). The prior
index-anchored `DaySlice` (`startIdx`/`endIdx` into a frozen `pointOrder` snapshot) is why
the interaction gate existed in the first place — any point mutation mid-draft would shift
every later index. The draft is re-anchored by **point ID** (`endPointId`, mirroring the
DB's own `Day.startPointId`/`endPointId`) and resolved to indices only at render time, so
point drops/deletes/renames/type-changes are well-defined — and continue to **save
immediately, live, even while a boundary draft is dirty**. `apply-boundaries` (the M4b
atomic batch endpoint) and its all-or-nothing backend transaction are unchanged.

**Add-day moves onto the last boundary handle.** Each `BoundaryDivider` is visually the
header of the day *below* it; the plus-icon add-day button therefore renders on the
**last divider only** (the Day 1 static header carries it when exactly one day exists; a
slim bootstrap row carries it when zero days exist) — one unambiguous append point at the
bottom of the sequence, never on an earlier handle. Clicking it hands the new day N+1
**all of day N's points**; day N collapses to zero length (`endPointId` becomes its own
start anchor — the overnight stop it shares with day N-1), so the new handle appears
immediately below the one that created it with no point rows between them, and the user
drags it down to place day N's actual end. This is a deliberate change from M4c's midpoint
split. A day saved while still collapsed is not an inconsistency: `apply_boundaries`
already accepts a `start === end` boundary item (the same state a drag-to-clamp produces
today), and a day dropped from the payload entirely has its boundary FKs nulled
server-side (`itinerary_service.py` boundary-apply loop) — both paths pre-existed M14.
A zero-length day anchored at a stop is, incidentally, a natural rest-day
representation — noted as a free side effect, not implemented as a feature here.

**Real-day deletion joins the draft.** Previously, deleting a *real* day was immediate and
non-discardable while every other draft edit reverted on Discard — an inconsistency. M14
folds day deletion (real or draft-only) into the draft; a real day's row is only actually
deleted server-side inside Save, symmetric with how draft-day rows were already only
*created* inside Save. This extends M12's orphan-leak invariant from "no day creation
before Save" to **no server-side `Day` mutation of any kind before Save**.

**Discard narrows to day-structure.** Because point edits now save live during a dirty
draft, Discard can only revert boundaries/dates/day-add/day-remove — it no longer implies
reverting the point edits made while it was open (M12's model made this trivial by
freezing points during the draft; M14 gives that up deliberately). Point mutations are
never silently lost; they were saved, on purpose, the moment they happened.

Backend: unchanged. All orchestration (draft-day creation, real-day deletion, payload
assembly, optimistic dispatch, rollback-on-failure) stays client-side, exactly as M4b's
batch-apply design intended. Full design and step-by-step implementation plan:
`plans/M14-flat-itinerary-edit.md`.

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

`stop` and `position` are the route. `interest` is **removed as a `Point` type** (landed M4e,
2026-06-21) — POIs are not part of the paddled line and were reintroduced as the standalone `Place`
entity (the tidal-diamond pattern; full design in `features.md`, Map Annotations). Route-model side:
the linked list and `pointOrder` carry only `stop`/`position`, the type selectors offer only those
two, and the type-icon legend dropped the interest star. The `Place` marker layer is day-independent
and toggleable from the Overlays control; places and tidal diamonds are dropped from one top-centre
**"+ Add"** disclosure (`MapAddControl`), the create-action counterpart to Overlays.

## Forecast cell: bounded velocity overlay (landing decorative, planner real)

`leaflet-velocity` renders particles across a rectangular data bbox. Zoomed out or
panned, that bbox reads as a dislocated animated square with hard edges — and on a
public landing it implies a full-coverage forecast the app can't stand behind.
Decision: render velocity as a **forecast cell** — the field clipped to a
soft-rimmed **disc** whose contour ring shows the **actual coverage extent** (the
diameter of the area the field represents). **Principle:** the cell communicates
coverage and nothing else — it does not repeat values, units, time, a legend, or a
distance scale that other components of the same view already provide.

- **Landing** (M1 redesign; `lib/landing/ambient-wind.ts` + `landing-map.tsx`,
  preview at `/preview/landing`): the field is **synthesized, decorative only** — it
  represents **wind** (not current, so it drifts over land and sea alike; label reads
  "surface wind · illustrative"), and carries motion and palette, nothing more. It **must never** show a legend, scale,
  or timestamp (that would imply a trustable forecast); the label reads
  "illustrative". Flow is a **coherent** dominant-drift field (`flowVector`: one
  drift direction + a sub-one-cycle meander), not high-frequency noise. Density is
  zoom-independent by construction (masked disc) with a deliberate per-zoom taper.
- **Planner (M5)** is the intended home for the same bounded-cell treatment over the
  **real** OpenMeteo overlays. The cell shows **only its coverage extent** — it does
  **not** repeat the forecast's values, units, time, or legend, which already live in
  the forecast panel/cards of the same view. Lifting the cell into the shared
  `VelocityLayer` is **pending design**: planner data is a full-area grid, not a
  single point, so the coverage derivation differs.
- **Shared `VelocityLayer` changes (landed, benefit both surfaces):** the canvas is
  hidden instantly on zoom/pan start and faded back after a settle delay (the stale,
  mis-projected frame never shows particles off-field); options apply in place via
  `setOptions` (no rebuild → no ~750 ms restart blank), enabling a live
  zoom-derived `particleMultiplier`; `VelocityGridLayer.data` now allows `null`
  (masked) cells. The landing also draws a real geographic graticule (hidden during
  gestures, redrawn on settle) and a segmented nautical scale bar, with zoom locked
  to the Esri Ocean basemap's useful range.

## Shared form primitives and the create/edit form-pair pattern (ADR-032)

A cross-cutting review of the component layer (2026-07-03, full findings in
`plans/component-abstraction-review.md`) found the app's compact forms had grown by
copy-paste: seven local copies of the micro `FieldLabel`, five of the native-select
class string, inline destructive-error paragraphs everywhere — and, worse, two
dialog families (shuttle vehicles, travel documents) had forked their entire form
body into separate add/edit components. The forks had already drifted: the add
dialogs displayed validation errors their edit twins silently dropped, and toggle
reset behavior differed between variants. Copy-paste duplication of form bodies is
not a cosmetic problem; it is where correctness drift comes from.

**Decision — two conventions, now load-bearing:**

1. **Shared form primitives.** `components/common/form-field.tsx` is the single
   source for compact-form furniture: `FieldLabel` (micro-label), `FieldError`
   (inline validation message, renders nothing without one), `NativeSelect`
   (styled native `<select>`), and the exported `fieldLabelClass` for display-only
   `<span>` labels (read-only value cards, where a `<label>` element would be
   semantically wrong). Form components must not re-declare these locally.
   `components/common/accent-dialog.tsx` provides `AccentDialogContent`, the
   accent-bar dialog shell (colored top bar + icon-tinted title); its `accent`
   comes from the `palette` in `lib/tokens.ts`, never hardcoded hex at call sites —
   keeping the token file the cross-platform source of truth it was designed to be.

2. **One form per create/edit pair.** A create/edit dialog pair shares a single
   form component. The form owns `useForm`, layout, and validation display, and
   takes `values?` (prefill for edit), `isPending`, `error` (root error string),
   `submitLabel`, and `onSubmit(fields)`. The dialogs are thin shells owning the
   server action, pending/error state, and open/trigger state. `PlaceForm` (M4e)
   was the existing precedent; `VehicleForm` and `DocumentForm` now follow it, and
   `TidalDiamondForm` already matched. Where the create and edit variants genuinely
   differ (the document attachment section: pending-file picker on create,
   uploaded-file actions on edit), the difference enters through a slot prop
   (`attachmentSlot`), not a fork.

**Consciously rejected:** merging `PointDetailSheet` and `PointDetailModal`
(similar names, different jobs — summary strip vs full editor; they change for
different reasons), and any generic schema-driven form-builder abstraction —
react-hook-form plus the shared primitives is the right altitude; each form keeps
its own explicit layout.

**Consequence:** the four vehicle/document dialogs went from ~500 duplicated lines
to shared forms plus ~60-line shells, and the validation-message drift was fixed by
construction. Follow-ups are opportunistic, not scheduled: remaining forms with
inline error paragraphs (`new-trip-dialog`, profile forms, `tidal-entry-form`)
migrate to `FieldError` when next touched.

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
| M4e landed: `interest` gone from `PointType`; `Place` marker layer (day-independent, toggleable) + drop-a-pin; place/diamond add-actions unified in a top-centre `MapAddControl` "+ Add" disclosure | — | 2026-06-21 | Type selectors and icon legend now `stop`/`position` only; star icon removed; see `features.md` decision log for the `Place`/`PlaceCategory` entity |
| Shared form primitives (`form-field.tsx`, `AccentDialogContent`) + one-form-per-create/edit-pair convention | ADR-032 | 2026-07-03 | Component abstraction review; `VehicleForm`/`DocumentForm` join the `PlaceForm` pattern; accent colors from `lib/tokens` palette; sheet/modal merge and generic form-builder rejected; findings in `plans/component-abstraction-review.md` |
| Tile caching Layer 1 landed, narrowed to priority rows 1–2 only (M8 §D10) | ADR-033 | 2026-07-17 | `GET /api/v1/tiles/<layer>/<z>/<x>/<y>.png`, `layer ∈ {osm, seamark}`; MinIO-cached via `StorageService`, 7-day upstream refresh, stale-serves-on-upstream-failure; unauthenticated, `600/min` per-IP; all four map surfaces (`public-map`, `map-core`, `landing-map`, `explore-discovery-map`) route through it, `{s}` subdomain dropped. Sentinel-2/titiler (row 3) and Mapbox HD (row 4) stay deferred — `<layer>` is their future seam. Landing hero's Esri Ocean base is unaffected (client-direct per Esri terms, was never proposed for this proxy). |
| Builder mode architecture: real View/Edit segmented control; boundary editing becomes an explicitly-entered draft sub-state ("Save days"/"Discard"); "Add day" deferred until Save (M12 item 16) | — | 2026-07-09 | Fixed a real bug: immediate `Day` row creation on Add day meant Cancel left an orphaned row. Superseded by M14 below — the entry gate itself is removed, not the atomic-save behavior it introduced |
| Flat edit surface: boundary draft becomes implicit (first gesture materializes it) and ID-anchored (`endPointId`, not frozen indices); Save/Discard persistent-disabled instead of appear/hide; Add-day moves to the last boundary handle only, new day takes all of the old last day's points (collapse-and-drag, not midpoint split); real-day deletion joins the draft (no server `Day` mutation before Save); point edits save live even mid-draft, Discard narrows to day-structure only (M14) | — | 2026-08-02 | Supersedes M12 item 16's entry gate while keeping its atomic-apply/no-premature-server-mutation guarantee, extended to day deletion too; `plans/M14-flat-itinerary-edit.md` |
