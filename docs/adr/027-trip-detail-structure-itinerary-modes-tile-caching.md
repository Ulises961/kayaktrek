---
id: "027-trip-detail-structure-itinerary-modes-tile-caching"
title: "Trip detail page structure, itinerary page view/edit modes, and tile caching model"
abstract: "Restructures the trip detail page into a slim overview card plus a tabbed checklist with status indicators; replaces the itinerary tab filmstrip with a stats summary; unifies planning and happening into a single itinerary page with view and edit modes; defers static map thumbnail generation to a later milestone; and defines a two-layer tile caching architecture (server proxy + device cache) for offline use."
status: "accepted"
date: "2026-05-26"
deciders: []
tags: ["frontend", "ux", "navigation", "trip-detail", "itinerary", "offline", "m4b"]
---

# Trip detail page structure, itinerary page view/edit modes, and tile caching model

## Status

Accepted. Partially supersedes the trip detail tab layout defined in ADR-020 (decisions
1–3 on tab content and ordering). ADR-020 decisions that remain valid: tabbed layout as
the organisational mechanism; float plan tab gated to leader only.

## Context

Several pressures converged as M4 and M4b were being planned:

1. **Itinerary tab is cramped**: the current itinerary tab embeds content inside a card
   that takes secondary vertical position on the page. The itinerary is the spine of a
   kayak expedition — it should not compete for space with logistics and crew.

2. **Filmstrip (M4b §7) conflicts with weather/sea (M5)**: the filmstrip is point-centric
   (one card per point). Weather and sea data from M5 is day-centric. Merging them into
   the same surface would produce a cluttered horizontal scroller, especially on mobile.

3. **Planning and happening are not distinct modes**: a kayak expedition is a dynamic
   activity. Route adjustments, date rebasing, and re-evaluation of conditions happen
   throughout the expedition, not just before departure. The UI must not enforce a wall
   between "planning" and "happening" that the paddler has to cross to make adjustments
   mid-expedition.

4. **Offline tile access**: the map must work at sea with no connectivity. Tile caching
   needs to be designed as shared infrastructure, not a per-feature afterthought.

5. **External tile service cost and dependency**: an external static map API (Geoapify,
   Mapbox, etc.) adds a paid dependency to a zero-revenue, self-hosted application.
   All tile serving must be in-house.

---

## Decisions

### 1. Trip detail page structure

The trip detail page (`/trips/[id]`) is composed of two vertical sections:

**Overview card (slim)**
- Trip name, dates, difficulty, description, state badge, trip progression indicator.
- State transition button (forward-only, leader only).
- Leader-only actions: Float plan, Delete trip, (future: assign co-leader).
- Target: occupies no more than 40% of the initial viewport. Currently at ~70%; the
  excess comes from redundant spacing and low-density layout. Tighten in M4b §7.

**Tabbed checklist card**
- Five tabs: **Itinerary · Crew · Float Plan · Logistics · Gear**.
- Each tab header shows an icon alongside the label. No status indicator dots or
  completion colours — exploring all sections is the user's task, not the app's.
- Itinerary is the **default open tab** — it is the first thing the user sees after the
  overview.
- Tab content renders inline for lightweight sections (Crew, Float Plan, Logistics, Gear).
  The Itinerary tab is the exception — see decision 2.

### 2. Itinerary tab: stats summary, no embedded map

The itinerary tab does **not** embed a live Leaflet map. It renders a text/stats summary:

```
Itinerary
  14 days  ·  180 nm  ·  ~6h avg/day  ·  8 stops
  May 31 → Jun 13
  ─────────────────────────────────
  Day 1   Ribadeo → Foz      12 nm  5h 10min
  Day 2   Foz → Burela        9 nm  3h 48min
  Day 3   Rest day
  ...                         [Show all ↓]
  ─────────────────────────────────
  [Open itinerary →]
```

Rationale:
- An embedded map signals "interact here" — the wrong affordance for a planning overview.
- Stats (days, distance, avg time, stops, day rows) are faster to parse than a map
  thumbnail and work identically on mobile.
- No Leaflet on this page means no SSR/dynamic import complexity and faster page load.
- Deep interaction (map, weather query, point editing) belongs in the itinerary page
  (`/itinerary/[id]`). The tab is the entry point, not the destination.

If no itinerary exists: the tab shows an empty state with a "Create itinerary" button
(leader only). Crew members see "No itinerary yet".

**Static map thumbnail (deferred)**: a pre-rendered static image of the route (generated
server-side from geometry, stored in MinIO, no external service) could be embedded above
the stats row. Generation uses Option B: SVG polyline from route coordinates rendered to
PNG via `cairosvg`, triggered by the Celery worker after every `apply-boundaries` call.
No tiles required — route shape on a neutral ocean-colour background.
**This is deferred to a later milestone** (after M5). The stats summary ships first.

### 3. Itinerary page: unified view and edit modes

`/itinerary/[id]` serves both planning and happening contexts via two modes on the same
page. There is no separate "day plan" route.

**View mode** (default on entry):
- Full-bleed map showing the complete route with day colours.
- Horizontal day strip below or overlaid: one card per day in sequence, like a weekly
  weather forecast. Cards show: day number, date, distance, estimated paddling time,
  weather/sea summary chips (populated by M5; stubs in M4b).
- Clicking a day card: expands to show the day's points with notes, type icons, and
  photos (read-accessible to all trip members).
- During `happening`: today's card is the hero — larger, front and centre. Past days
  are greyed. Future days are readable.
- During `past`: all days read-only. Conditions as recorded.

**Edit mode** (explicit action, leader only during `building` and `happening`):
- The full M4b builder: PointListPane, drag-boundary editor, point dropping.
- Entry: "Edit route" button in the top bar (view mode) or top bar action (edit mode).
- Exit: "Done" returns to view mode. Changes are persisted via `apply-boundaries`.
- During `past`: edit mode is locked. "Edit route" button is not shown.

**Rationale for unification**:
- Planning and happening are not distinct phases — a paddler adjusts the route
  throughout the expedition. Forcing a mode switch to make mid-expedition adjustments
  creates unnecessary friction.
- The same data (days, points, weather) is useful in both contexts; only the
  interaction layer differs.
- One route, one bundle, one set of tests — no duplicate page to maintain.

### 4. Trip states

Trips have three user-facing states and one system-only terminal state:

| State | Meaning | User-facing |
|-------|---------|-------------|
| `building` | Trip is being planned — route, crew, logistics, gear | Yes |
| `happening` | Expedition is active | Yes |
| `past` | Expedition is over | Yes |
| `archived` | Leader was GDPR-erased; trip preserved for crew | No — inaccessible |

The backend `TripStateType` enum already uses `building`, `happening`, `past`,
`archived`. No schema migration required. ADR-011 is partially superseded on the
naming point; the state machine mechanics (forward-only, leader-only transitions)
remain valid.

### 5. State-aware landing behaviour

Trip state determines which surface the user lands on when entering a trip:

| Trip state | Landing |
|------------|---------|
| `building` | `/trips/[id]` — trip detail, Itinerary tab open |
| `happening` | `/itinerary/[id]` — view mode, today's day card highlighted |
| `past` | `/trips/[id]` — trip detail, Itinerary tab open, read-only |

For `happening` trips the redirect is trivial: the `/trips/[id]` server component checks
`trip.state` and calls `redirect(\`/itinerary/${trip.itinerary.id}\`)` before rendering.
No middleware, no client-side routing logic — a single conditional redirect in the server
component. The back arrow on the itinerary page returns to `/trips/[id]` when needed.

The trips list promotes the active `happening` trip as a hero card. Tapping it navigates
directly to `/trips/[id]` which immediately redirects to the itinerary.

### 6. Tile caching architecture

Two distinct cache layers serve different purposes and must not be conflated:

**Layer 1 — Server tile proxy (MinIO)**
- Tiles fetched once from OpenStreetMap, stored in MinIO, served from our own origin.
- Eliminates OSM direct-request dependency in production (OSM terms require high-traffic
  apps to use a CDN or their own tile server).
- Enables server-side static thumbnail generation (decision 2, deferred) without
  external API calls.
- Feeds both web clients and the initial mobile tile download.

**Layer 2 — Device tile cache (client-local)**
- Tiles stored on the device, not on the server. No network request required.
- Web (PWA): Service Worker + Cache API. User triggers "Download for offline" before
  departure. Tiles for the route corridor bounding box at zoom levels 8–15 are cached.
  Storage limits and eviction risk mean this is a best-effort cache, not a guarantee.
- Mobile M9 (React Native): device filesystem cache, explicitly downloaded and managed
  by the app. More storage, more reliable, user-controlled. Same mental model as Google
  Maps offline maps: download the route area before leaving port; the map works at sea
  with no signal.
- Route corridor tile footprint is small (~few hundred MB for a 200 nm coastal trip at
  relevant zoom levels) — user is shown a storage estimate before downloading.

**Scope**: the server tile proxy and device cache are infrastructure shared by the static
thumbnail (M4b/deferred), the itinerary map (current), M8 (expedition mode), and M9
(offline mobile). They should be scoped as a dedicated infrastructure milestone before
M8, not bolted onto any single feature.

**Tile sources and layer strategy (resolved)**

Three map layers, each with a distinct access model:

| Layer | Source | Access model | Resolution | Who |
|-------|--------|--------------|------------|-----|
| Base map | OpenStreetMap | Cached in MinIO; served from own origin | — | All users |
| Satellite | Sentinel-2 L2A (Copernicus/ESA) via AWS Open Data | Rendered by titiler; cached in MinIO | 10 m | All users |
| Satellite HD | Mapbox Satellite | Direct client↔Mapbox fetch; no server cache | < 1 m | Premium users |

**Base map (OSM)**: a caching reverse proxy (nginx or thin Flask endpoint) fetches from
OSM tile servers on miss and stores in MinIO. Long TTL — OSM tiles are stable. Feeds
the device cache download for offline use.

**Satellite free tier (Sentinel-2)**: Sentinel-2 L2A COGs from AWS Open Data (Element84)
are rendered to XYZ tiles on demand by **titiler** (`developmentseed/titiler`, MIT
licensed), deployed as a sidecar service in the compose stack. Tiles are cached in MinIO
under a `sentinel/` prefix with a medium TTL (Sentinel-2 revisits every 5 days; tiles
change slowly). Coverage: global, 56°S–84°N. Fully public domain — no ToS constraints.
Resolution at 10 m is sufficient for route-level coastal planning (distinguishing beach
from rocks, reading headland exposure) but not for sub-metre point inspection.

**Satellite HD (Mapbox, premium)**: tiles are fetched directly from Mapbox's CDN by the
user's browser — no server-side caching or storage. The backend checks subscription
status and issues a short-lived, referrer-domain-restricted Mapbox access token for
the session. The frontend uses this token in Leaflet for that session only. This model
is fully ToS-compliant: Mapbox's restriction is on caching and re-serving tiles, not
on brokered client-direct access.

Mapbox HD satellite is the primary premium value proposition: sub-metre coastal imagery
enables inspection of specific landing beaches, rock platforms, and hazard detail that
10 m Sentinel-2 cannot resolve. This maps directly to the map-first planning use case
(ADR-006).

Cost model: at ~$0.50–$1 per 1,000 tile requests, a premium user doing a full planning
session loads ~200–400 tiles (~$0.10–$0.40). A modest subscription price covers costs
at any realistic user count.

Sources evaluated and rejected:
- **NASA GIBS (MODIS)**: 250 m resolution — too coarse for coastal point placement.
- **Esri World Imagery**: higher resolution than Sentinel-2 in some areas, but ToS
  ambiguity for caching. Mapbox HD covers the high-resolution need more cleanly via
  the premium model.

### 7. Point detail: zoom-and-sheet interaction

Tapping a point card in the day detail carousel triggers a two-step interaction:

1. **Map zooms to the point** (`flyTo(lat, lng, zoom ~14)`) with a bottom padding
   offset equal to the sheet height, so the point centres in the visible map area
   above the sheet rather than behind it.
2. **A bottom sheet slides up** (~55 vh) showing: full notes (no truncation), photo
   gallery, exact coordinates, point type.

The sheet covers the lower portion of the map. This is intentional: at the moment of
point inspection the user's focus shifts from spatial overview to point detail, and the
zoomed map above the sheet provides the relevant coastal context (the specific beach,
headland, or hazard) rather than the full-route view. This mirrors the established
pattern in Google Maps and similar apps.

When the sheet is dismissed, the map remains at the zoomed level. The user controls
pan and zoom from that point. The day carousel and day detail carousel remain accessible
below the sheet so the user can navigate to the next point without closing.

Rationale for sheet over a separate route (`/itinerary/[id]/point/[id]`): navigation
to a new page discards carousel position, selected day, and map state. A sheet
preserves all context and is dismissible in one gesture.

---

## Consequences

**Positive**
- The itinerary tab ships simpler and faster (stats summary, no Leaflet embed) and is
  immediately useful on mobile.
- View/edit modes on the itinerary page eliminate the cognitive friction of switching
  between "planning tool" and "day overview" — they are the same page.
- The ADR-020 tab structure is preserved; this is an evolution, not a rewrite.
- Tile caching is designed as shared infrastructure, avoiding three separate ad-hoc
  implementations across M4b, M8, and M9.
- Deferring the static thumbnail decouples a nice-to-have from the M4b critical path.

**Negative / trade-offs**
- The itinerary page now has two distinct layout modes (view and edit) to maintain.
  State management must be careful not to bleed edit-mode draft state into view mode.
- The `happening` landing behaviour (direct to itinerary view mode) requires the trips
  list to detect state and route accordingly — a small but non-trivial routing addition.
- Static thumbnail generation (Celery + cairosvg + MinIO) adds task infrastructure
  that is not yet in the stack. Deferred deliberately.
- Tile proxy infrastructure is new backend work with no existing code. Deferred to
  a dedicated milestone.

**Open questions**
- **Food planning**: flagged as a future tab alongside Gear. Distinct from inventory
  (consumables vs equipment, meal planning vs packing list). Scope separately when
  the inventory milestone (M6) is complete.
- **Co-leader assignment**: flagged in the overview card. Permissions model (can a
  co-leader transition state? edit the route?) not yet defined.
- **"Download for offline" UX**: what bounding box strategy? Route corridor + N km
  margin? User-drawn box? What zoom levels? Design before M8.
- **Tile proxy choice**: resolved in decision 6. OSM uses a caching reverse proxy
  (nginx or thin Flask endpoint) storing in MinIO. Sentinel-2 uses titiler as a
  sidecar rendering COGs from AWS Open Data. TileServer GL is not used.
- **Premium subscription model**: the Mapbox HD layer is the first premium feature.
  Subscription tiers, pricing, and billing infrastructure are out of scope until the
  feature set is closer to complete. The backend must support a `is_premium` flag on
  User before the Mapbox token issuance endpoint can be built.
