---
id: "026-itinerary-builder-unified-sidebar-boundaries-editor"
title: "Itinerary builder UX redesign — unified sidebar, drag boundaries editor, first-class itinerary"
abstract: "Replace the mode-toggle / hover-slide interaction with a unified sidebar shared across point-dropping and boundary-editing, a drag-handle boundaries editor with atomic batch apply, first-class itinerary entities (trip_id nullable, named, public-toggleable), consecutive-date defaulting with explicit rest-day gaps, estimated paddling time per leg and day, photo-level public visibility, explore-surface deduplication via lineage, and GPX import/export."
status: "accepted"
date: "2026-05-25"
deciders: []
tags: ["frontend", "ux", "itinerary", "m4b"]
---

# Itinerary builder UX redesign — unified sidebar, drag boundaries editor, first-class itinerary

## Status

Accepted — partially supersedes ADR-024 (decisions 3, 4-sidebar-pencils, mode-toggle,
and 9-drop-popover). Also resolves the M1 landing page blocker (public map visibility
flag — see §6).
ADR-024 decisions that remain valid: route-first model (§1), Day 0 staging (§2),
`start_point_id`/`end_point_id` FKs on Day (§4-data), navigation back arrow (§5), distance
labels (§6), draft persistence (§7), day colours (§8), marker style (§11), distance unit
toggle (§12).

## Context

M4 shipped the itinerary builder with a two-mode interaction: **Drop points** mode (click map
to place points) and **Assign days** mode (click markers to bracket day ranges using a
hover-slide mechanic). Several reliability problems emerged once the implementation was complete:

1. **Stale stop markers**: reassigning a boundary never resets the old endpoint's `type`
   back to `position`. Old stop markers persist on the map after boundaries change.

2. **Adjacent-day sync gap**: `handleSaveSlide` for start-only changes updates Day N's
   `startPointId` but never updates Day N-1's `endPointId`. The sidebar shows stale labels
   until the adjacent day is touched.

3. **Fragmented state across slide cycles**: `slideState` is a single slot. A Cancel on one
   day does not restore what an adjacent day's earlier slide changed. Multiple in-flight
   saves can interleave. There is no atomic "commit everything at once" path.

4. **Mode-switch friction**: the explicit Drop ↔ Assign toggle is mechanical. Inserting a
   missed point mid-assignment requires switching back to Drop mode, adding the point, then
   switching back to Assign. The two tasks are not mutually exclusive in the user's mental
   model — they are concurrent stages of the same activity.

5. **Navigation cost during development**: the builder is accessed via Trip detail →
   Itinerary tab → "Open map builder". After every hot-reload or login-required restart,
   the full navigation chain must be repeated. A direct `/itinerary/[id]` URL (bookmarkable)
   would eliminate this friction.

6. **Itinerary as child of trip**: the current schema requires a trip before an itinerary
   can exist. Expedition planning in practice runs the other direction — sketch the route
   first, organise participants later. An itinerary without a trip is a valid and common
   starting state.

7. **Point enrichment is a third planning stage**: drop points (geometry), assign days
   (rhythm), then annotate stops (logistics). Mixing POI search, notes, photos, and type
   changes into the route-building UI splits attention during the wrong task. A collaborative
   annotation surface belongs in the trip detail page, not the map builder.

---

## Decision

### 1. Remove the mode toggle — one unified builder

The explicit Drop points / Assign days mode toggle is removed from the top bar. The map
is always in "drop" mode: clicking the map places a point; dragging a marker moves it.
Boundary editing happens exclusively in the sidebar — there is no mode on the map that
changes what a click means.

**Rationale**: the mode conflict only existed because Assign days mode repurposed map-marker
clicks to mean "set as boundary". Moving boundaries into sidebar drag handles removes the
conflict entirely. Map markers go back to a single meaning: place or move a point.

### 2. Unified sidebar shared by both interactions

A single `PointListPane` component replaces `DropSidebar` and `DaySidebar`. It renders the
route as a vertical ordered list of point rows — the same list in both contexts. Switching
context does not re-render a different list; the list stays in place.

**Point row format**: ordinal index first, name in parentheses if present — `12 (Cedeira
harbour)` or just `12` if unnamed. Ordinal position enables quick scanning of boundaries;
the name adds semantic and orientational context when present. Lat/lon is never shown —
coordinates are meaningless to a paddler at a glance.

Each row shows: 4 px colored left strip (day color, grey if unassigned), index + name, and
a type icon (anchor ⚓ = stop, dot = position, star = interest).

**Type is always editable in the sidebar**: point rows are interactive in both drop and
boundary-edit contexts. The type selector and name field are accessible directly on the
expanded row regardless of what mode the builder is in. The only exception is a boundary
point (a day's start or end): its type is locked to stop (anchor) and cannot be changed —
the anchor icon renders without a selector. This makes the sidebar the single editing
surface for point metadata; the map and any floating panels are not.

**Drop context auto-expand**: when the user clicks the map to drop a point, the newly
created row auto-expands in the sidebar (scroll-into-view) with the type selector and name
field immediately ready. The user sets type and name in the sidebar; clicking elsewhere or
scrolling collapses the row. Map ↔ sidebar sync is preserved: clicking a marker expands
its row; clicking a row centers its marker.

**The `PointDropPanel` floating chip card is removed**: it is fully absorbed into the
sidebar row. The map has no floating element after a drop. The "Undo" action from the chip
card is already covered by the top bar "Remove last waypoint" button and by the delete
action in the expanded row; no separate undo affordance is needed.

### 3. Boundaries editor — drag handles, not hover-slide

Day boundaries are shown as horizontal divider lines inserted between point rows in the
sidebar list. Each divider carries a **day-pill handle** flush to the right edge. The pill
shows the day number, date, and a grip icon; it is the sole drag target.

**Drag mechanics**:
- `pointerdown` on a pill → pointer capture → `pointermove` updates `endPointIdx` in draft
  state → `pointerup` releases capture.
- During drag, if the pointer is within 48 px of the scroll container's top or bottom edge,
  the container auto-scrolls at a rate proportional to proximity. Wheel scroll events and
  pointer-drag events are distinct streams; no conflict.
- A boundary cannot be dragged above the previous day's boundary (minimum 1 point per day).
  If the drag gesture pushes boundary N against boundary N-1, both boundaries move together
  as a rigid unit (chain drag). They decouple when the gesture moves back down.

**Live map update**: during drag, `previewDays` is derived from draft state and passed to
`MapCore` in place of `state.days`. Map polylines recolor immediately. The map is passive —
colors are output of sidebar decisions; no map click can set a boundary.

**Adding a day**: creates a new divider at the current end of the last assigned day (0-point
Day N+1). The new pill immediately accepts drag input; the user drags down to expand Day N+1
into unassigned points, or up (chain dragging Day N) to redistribute from Day N.

**Apply / Cancel**: a persistent Apply button commits all draft boundaries atomically. Cancel
discards the draft and restores the pre-edit state. No per-day Save/Cancel cycle.

### 4. Atomic boundary application — batch endpoint

`BOUNDARIES_APPLY` replaces the cascade of per-day `SLIDE_COMMIT`, `POINTS_ASSIGN`, and
`DAY_UPDATE` actions. It computes the full new state in one pass:

1. For every point in `pointOrder`: determine its new `dayId` from the draft boundaries.
2. Determine `type` changes: points that *were* boundary stops but no longer are → reset to
   `position`; points that are now boundary endpoints → set to `stop`.
3. Update `day.startPointId`, `day.endPointId`, and `day.date` for every day simultaneously.

This eliminates the stale-stop and adjacent-day sync bugs by construction — there is no
intermediate state where some days are updated and others are not.

**Batch API endpoint** — delivered in the same backend pass as first-class itinerary (§5):

```
POST /api/itinerary/:id/apply-boundaries
Body: {
  boundaries: [{ dayId, startPointId, endPointId, date }],
  points: [{ id, type, name }]
}
```

`boundaries` drives the day reassignment. `points` carries every point whose type or name
diverged from the last saved state — including boundary endpoints (always `type: "stop"`)
and any non-boundary points whose type or name the user changed inline in the sidebar during
the boundary-edit session. The backend executes both arrays in a single database transaction:
reassigns all points to their new days, applies type resets (old stops that are no longer
boundaries → `position`), and applies all dirty name/type fields. Returns the updated
itinerary.

Outside boundary-edit mode (point accordion in drop context, filmstrip in trip detail),
point name and type changes continue to save immediately via individual `PATCH /api/point/:id`
calls. They only queue into the batch when the boundaries editor is open.

### 5. First-class itinerary entity

`trip_id` becomes nullable on the `itinerary` table. An itinerary can be created without
a trip, assigned to a trip later, or used to create a new trip from scratch.

**Itinerary name**: a required `name` field is added to the itinerary model. The name
identifies the route in the listing ("Galician Coast — Ría de Arousa to Finisterre").
When an itinerary is used to create a trip, the trip name defaults to the itinerary name
(editable at creation time). When a trip is used to create an itinerary, the itinerary name
defaults to the trip name. The two names are independent after that initial default — no
ongoing sync.

**New surfaces**:
- `/itinerary` — listing page, sidebar nav item "Itineraries". Shows all of the user's
  itineraries with or without a trip assignment.
- `/itinerary/[id]` — the map builder (already exists). Directly accessible and bookmarkable;
  no longer requires navigating through the trip detail page.
- "Assign to trip" and "Create trip from this" as explicit actions on the itinerary card.

**DX benefit**: `/itinerary/[id]` can be bookmarked and reloaded directly after a breaking
change or login cycle, eliminating the trip → tab → button navigation overhead.

### 6. Public itinerary sharing and community route library

An itinerary can be made public via an explicit `is_public` toggle regardless of whether it
is assigned to a trip. This extends ADR-012 (itinerary visibility is independent of trip
privacy) to the first-class-itinerary context.

**This resolves the M1 landing page blocker**: CLAUDE.md flagged M1 as blocked on whether
the public map uses a trip-level, itinerary-level, or separate sharing flag. Decision:
`is_public` lives on itinerary only. No `is_public` flag is added to Trip. The landing page
shows public itineraries on a Leaflet map without requiring authentication. M1 is unblocked.

**Privacy model**:
- Default: private to owner.
- `is_public = true`: the route geometry is readable by anyone including unauthenticated
  users. Private fields are never included in the public read shape — the API returns a
  distinct stripped schema for public access.

**What is visible publicly**: route geometry (point lat/lon, names, types), day boundaries,
distances, estimated paddling times, day count, total distance, itinerary name, owner display
name. Explicitly-flagged photos (see §9).

**What is never visible publicly**: point notes, linked trip details, trip member data, any
field from the collaborative enrichment layer, photos not explicitly marked public.

**Community browse surface**: the landing page map and a `/explore` page show all public
itineraries without requiring authentication. Clicking a route shows its detail: name, day
breakdown, distance summary, public photos.

**Copy / fork**: any authenticated user can "Use this route" on a public itinerary — creates
a private copy in their own list. Copies are fully independent. An optional `created_from_id`
(nullable FK back to the source itinerary) is stored on the copy for attribution and lineage
tracking; it carries no enforcement or dependency.

**Cold start / seeding**: a small set of well-known coastal routes pre-seeded under an
admin account makes the explore surface immediately valuable before the community grows.
Seeding uses the same API as any other itinerary creation — no special schema needed.

### 7. Three planning stages — enrichment deferred to trip detail

The builder covers two stages: geometry (drop) and rhythm (boundaries). The third stage —
logistics annotation — is collaborative and belongs in the trip detail page.

**Trip detail itinerary tab** (replaces the current stub):
- Read-only embedded mini-map at the top showing the full route with day colours.
- **Horizontal filmstrip carousel** below the map: one card per point in route order.
  Left-to-right scroll mirrors the spatial sequence of the route. As the filmstrip scrolls,
  the map pans and highlights the corresponding marker.
- Tapping a card expands it: name editor, type selector, notes textarea, photo gallery,
  "Find nearby POIs" (interest type only). All trip members can edit.
- Point card label uses the same `12 (Cedeira harbour)` / `12` format as the builder sidebar.

### 8. Estimated paddling time — speed-based leg and day labels

Distance alone is insufficient for day planning. Paddlers think in hours — "can I sustain
8 hours of paddling?" is more actionable than "can I paddle 20 nm?". An estimated time
label is added to every leg and every day card, derived from a configurable average speed.

**Default speed**: 2.5 knots (a conservative loaded expedition kayak in moderate conditions).
Configurable at the itinerary level via a control in the top bar. A per-day speed override
is a natural future extension but is not in scope for M4b — one speed applies to the whole
itinerary.

**Leg label format** (polyline tooltip at segment midpoint): `4.2 nm · 1h 41min`. The
separator is `·`, not brackets, for readability at small label sizes.

**Day pill and day summary**: total day distance + total estimated paddling time, e.g.
`18.4 nm · 7h 22min`. This is the primary readout that tells the paddler whether a day is
realistic. Shown in the day-pill boundary handle and in the day summary header.

**Speed stored on itinerary**: `avg_speed_knots` (float, default 2.5) added to the itinerary
model. Persisted so the setting survives page reloads.

### 9. Consecutive dates with explicit rest-day gaps

When boundary dividers are drawn, the day-pill handles display and accept a date. Dates
default to consecutive calendar days starting from `trip.startDate` (or today if the
itinerary has no trip). Day N date = start date + (N − 1) days.

If the user sets Day N's date to a non-consecutive value relative to Day N-1 (a gap of more
than one calendar day), that gap is a **planned rest day** — consistent with ADR-025. The
boundary editor shows a visual gap indicator between the two pills when a rest day is present.

**Mid-expedition date adjustment**: if the paddler changes future day dates during an active
expedition (e.g. falling behind schedule), this is treated as a schedule rebase — not a pause
and not an alarm condition for the shore contact. The shore contact alerting system (M3h /
ADR-022) must evaluate checkpoint deadlines against the current committed dates, not the
original dates. A date change by the paddler implicitly rebases all future checkpoints.

The `is_paused` flag from ADR-025 signals a different state: *"I am stopped and may miss the
next checkpoint window."* A date change signals: *"I am still paddling, just slower."* These
two states must not be conflated in the alert logic.

### 10. Photo-level public visibility

Photos attached to points are private by default. When an itinerary is made public, the
owner can explicitly mark individual photos as public during the publish flow. Only those
photos appear in the public read shape.

An `is_public` boolean is added to the `Image` model. The public itinerary API serializer
filters `images` to `is_public = true` only. Photos of beaches, landing spots, tidal races,
and harbour entrances are genuine community-useful route information; the photo-level flag
lets the owner share them without exposing personal shots from the same trip.

### 11. React context for map builder state — no prop drilling

The `MapBuilder` component owns `mapReducer` state, draft boundary state, and the
`avg_speed_knots` setting. As the component tree deepens (unified sidebar → point rows →
expanded accordions → boundary handles), threading these as props creates a brittle chain
that obscures data flow and makes each component's test setup verbose.

**Decision**: introduce `MapBuilderContext` — a single React context provided by
`MapBuilder` and consumed by any descendant. It exposes:

```ts
type MapBuilderContextValue = {
  state: MapState
  dispatch: Dispatch<MapAction>
  draftBoundaries: DraftBoundary[] | null   // null when not in boundary-edit mode
  setDraftBoundaries: (b: DraftBoundary[] | null) => void
  tripId: string
  distanceUnit: "nm" | "km"
  avgSpeedKnots: number
  setAvgSpeedKnots: (v: number) => void
}
```

Components that need state consume the context directly via `useMapBuilder()` (a thin hook
wrapping `useContext`). No prop for these values is passed below `MapBuilder`.

**What stays as props**: values that are truly local to a component subtree (e.g., whether
a specific accordion item is expanded, the scroll position of the sidebar). These remain
co-located with the component that owns them.

**Testing**: tests wrap the component under test in a `<MapBuilderProvider value={...}>`
test utility. This is equivalent in verbosity to providing props; the difference is that
adding a new piece of shared state does not require updating every intermediate component's
prop types and test fixtures.

### 12. Explore-surface deduplication via lineage — no DB deduplication

DB-level deduplication of itinerary geometry (detecting and merging near-identical routes) is
rejected. Route data is trivially small (a few KB per itinerary); even 100,000 public routes
is a few hundred MB — not a storage concern. DB deduplication would be premature complexity.

The real concern is **explore-surface clutter**: many forks of the same classic route creating
noise on the browse map. This is handled at the display layer:

- `created_from_id` lineage already captures fork relationships.
- The explore map clusters spatially overlapping routes into a single visual element with a
  count badge and a "N versions of this route" detail panel.
- Clustering is a frontend rendering concern using Leaflet marker clustering; no schema or
  API changes needed beyond what `created_from_id` already provides.

### 13. GPX import and export

GPX is the universal GPS interchange format — compatible with Garmin, Navionics, OpenCPN,
and chart plotters used on the water. A bespoke lat/lon dump is a closed island; GPX plugs
into the existing GPS ecosystem immediately. No external service is needed: `gpxpy` (Python)
handles both parsing and generation.

**Export** — `GET /api/itinerary/:id/export?format=gpx`:
- Returns a GPX file with `<rte>` (route waypoints) preserving point names, types as
  waypoint symbols, and day boundaries encoded as waypoint description metadata.
- Available on the itinerary detail page and on the public detail view (unauthenticated).
  A public itinerary's GPX includes only public-visible fields (no notes).

**Import** — `POST /api/itinerary/import` (multipart, GPX file):
- Accepts both `<rte>` (planned route) and `<trk>` (recorded GPS track).
- Parses waypoints/trackpoints → creates points in Day 0 → returns the new itinerary ID.
- Opens the builder at the new itinerary; the user proceeds to draw boundaries as normal.
- Enables the inbound path from the GPS ecosystem: a paddler plans in Navionics, exports
  GPX, imports here to add days and collaborative enrichment.

---

## Consequences

**Positive**
- Stale-stop and adjacent-day sync bugs are eliminated by the atomic batch apply.
- Removing the mode toggle reduces the interaction vocabulary: one surface, one set of
  affordances. Users do not need to remember which mode they are in.
- The unified sidebar is smaller and testable in isolation — no dependency on `slideState`,
  `hoveredPointId`, or `phase`.
- First-class itinerary unblocks planning without a trip and removes navigation overhead
  during development iteration.
- `is_public` on itinerary resolves the M1 landing page blocker — the public map can now
  be built without a trip-level visibility model.
- GPX import/export bridges the app to the wider GPS ecosystem at low implementation cost.
- Community route library with copy/fork and lineage creates a flywheel: more public routes
  → more useful explore surface → more users contributing routes.

**Negative / trade-offs**
- `SLIDE_*` reducer actions and `SlideState` type become dead code that must be removed
  cleanly. The migration will have a transitional period with unused code paths.
- The drag-handle boundaries editor requires pointer event handling with auto-scroll logic —
  more complex to implement than the current click-based slide, but more reliable.
- `trip_id` nullable is a schema migration. Existing itineraries (all have a `trip_id`) are
  unaffected, but the migration must be tested against the staging data fixture.
- The horizontal filmstrip in the trip detail tab requires a Leaflet embed in a page that
  currently has no map. Dynamic import (SSR disabled) is the established pattern — it works
  but adds bundle weight to the trip detail page.
- The batch endpoint (`POST /api/itinerary/:id/apply-boundaries`) is a new backend surface
  that must be implemented before the frontend Apply button is wired up — it is on the
  critical path for M4b.
- Photo-level `is_public` adds a flag to the Image model and requires the publish flow to
  include a photo selection step. Minor schema change, minor UX addition.
- GPX import requires the backend to parse arbitrary user-supplied XML — `gpxpy` must be
  used with a file size limit and error handling for malformed input.

**Open questions**
- **Itinerary → trip assignment permissions**: only the itinerary owner can assign it to a
  trip, or can any trip leader pull an itinerary in? Define before the "Assign to trip"
  action is implemented.
- **Mobile touch interactions for boundaries editor**: the drag-handle editor is designed for
  pointer devices. Touch equivalents (drag on mobile browser) need a dedicated pass. The
  filmstrip carousel and GPX download are naturally touch-friendly.
- **GPX track simplification on import**: a recorded GPS track may have thousands of
  trackpoints (one per second). Importing raw produces an unusable number of points. A
  simplification pass (Ramer-Douglas-Peucker with a configurable tolerance) should be applied
  on import. Tolerance default TBD — expose as a slider in the import dialog.
