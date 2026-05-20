# ADR-024: Map-first itinerary builder — route-first model, hover-slide day bracketing

**Status**: accepted  
**Date**: 2026-05-19  
**Implements**: M4 (Map-first Itinerary Builder)

## Context

M4 delivers the itinerary builder on top of a Leaflet map. Before implementation, three
fundamental design questions needed answers:

1. **Mental model**: should users plan day-by-day (select a day, drop points for it), or
   plan the full route first and divide it into days afterwards?
2. **Day assignment UX**: if route-first, how does the user associate points with days?
3. **Navigation**: the itinerary builder needs near-full-screen map real estate, but the
   app sidebar provides essential spatial context for the user. How do you balance both?

Additionally, several data model questions arose from the chosen interaction:

4. How are shared boundary points (simultaneously the end of Day N and the start of Day N+1)
   represented without duplicating point data?
5. Can draft itineraries be persisted and recovered without adding a `status` field?

---

## Decision

### 1. Route-first, bracket-into-days

**Rejected: day-first model** — Users must commit to day boundaries before seeing the full
route. In practice, kayak expedition planning starts with tracing the coast and identifying
feasible stopping points; day breaks emerge from that picture, not before it.

**Accepted: route-first model** — The user drops all points freely onto the map as one
continuous route, then divides the route into days by bracketing sections in the sidebar.
This matches how experienced paddlers plan on paper or chart-table.

### 2. Day 0 as a staging area

All newly-dropped points are assigned to **Day 0** (`day_number = 0`) at creation time.
Day 0 is an internal implementation detail — it never appears in the UI. It is created
automatically in the same database transaction as the itinerary.

`GET /api/day/itinerary/:itineraryId` filters out `day_number = 0` so Day 0 is invisible
to all frontend consumers except the raw point fetch used by the map to render all points.

Unassigned points (Day 0 points) are rendered as grey markers. As points are bracketed
into numbered days they move from grey to the day's auto-assigned colour.

### 3. Hover-slide day bracketing

The sidebar shows a stack of **day cards**, each with `START` and `END` slots.

Bracketing flow:

1. User switches to **Assign days** mode (map mode toggle in the top bar).
2. Day 1 card auto-creates. User clicks a marker → Day 1's start is set; marker colours.
3. User hovers along subsequent markers. Each hovered marker progressively colours with
   Day 1's colour; the `END` slot and point count update live.
4. User clicks to lock the end. All points from start to end are PATCHed to Day 1's
   `dayId`. Day 2's card auto-appears with its `START` pre-filled.
5. Repeat until Day 0 is empty.

**Re-bracketing**: clicking "Edit" on a day card re-enters slide mode from the current end
point. Hovering forward extends the day; hovering backward retracts it. Adjacent days
recolour to fill or vacate the gap in real time.

**Rationale for hover-slide over alternatives** (click-first+click-last, drag handles,
dropdown select): the linked list already encodes the traversal order, making hover-on-marker
the simplest possible interaction — `mouseover` events on existing Leaflet markers, no
arbitrary mouse-on-polyline geometry required. The progressive colouring gives immediate
visual feedback with no intermediate UI layer.

### 4. start_point_id / end_point_id FKs on Day

A boundary point (the end of Day N / start of Day N+1) belongs to Day N (`dayId = dayN.id`)
and is **not** duplicated. Day N+1 references it explicitly via two new nullable FK columns
on the `day` table:

| Column | Type | Notes |
|--------|------|-------|
| `start_point_id` | `UUID NULL FK → point.id` | First point of the day's leg |
| `end_point_id` | `UUID NULL FK → point.id` | Last point of the day's leg |

These fields are needed because a point can be Day N's end and Day N+1's start
simultaneously, without appearing in Day N+1's `points[]` array. The frontend reads
`startPointId` to render the split-circle boundary marker (left half Day N's colour, right
half Day N+1's colour) and to pre-fill the next day card's `START` slot.

All point data (lat/lon, notes, images, type) lives exactly once in the `point` table.
The FKs are pure references — nothing is duplicated.

**Migration**: two nullable UUID columns added to `day` in the M4 backend pre-patch (§0).
`DaySchema` (Marshmallow) exposes them as `dump_only` on GET and accepts them on PATCH.

### 5. Navigation: sidebar auto-collapse + back arrow

**Rejected: remove the sidebar** — the app sidebar is the sole global navigation element.
Removing it on the itinerary route breaks spatial continuity and creates a disorienting
context switch for the user.

**Accepted: auto-collapse to icon-only + back arrow**

- A route-detection hook (`hooks/use-collapse-sidebar.ts`) collapses the sidebar to its
  icon-only state on mount and restores it on unmount. The sidebar remains interactive
  (hover/click to expand) so the user can navigate away at any time.
- Navigation back to the trip uses a **back arrow** in the floating top bar
  (`← Trip name`), consistent with the float plan page. No breadcrumb — the back arrow
  is the sole exit path from the map builder.
- No ephemeral sidebar entry is injected for the itinerary builder. The sidebar lists
  top-level destinations; the itinerary builder is a sub-page of a trip, not a destination.

### 6. Inline distance labels and running totals

- Each polyline segment carries a **distance label** (haversine, km or nm) rendered as a
  Leaflet `Tooltip` at the segment midpoint.
- The top bar stats strip shows the **total route distance**, recalculated on every point
  add, remove, or drag using `lib/itinerary/distance.ts` (pure haversine functions).
- Each day card in the sidebar shows the **day's total distance** (sum of segment distances
  within that day's bracketed range), updated live as brackets change.
- A **"Remove last waypoint"** button in the top bar (Drop points mode only) deletes the
  tail of Day 0's linked list and immediately updates the polyline and totals.

### 7. Draft persistence without a status field

The itinerary has no `status` or `is_draft` field. Every mutation (point drop, drag,
bracket assignment) is persisted immediately via server actions. Returning to
`/itinerary/[id]` fetches the current backend state and restores the exact map state.

**Draft detection heuristic** (frontend only): if Day 0 still has unassigned points the
itinerary is treated as a draft. The Itinerary tab on the trip detail page shows
"Draft — continue in map builder" when `day0.points.length > 0`, and the full summary
(miles, days) when Day 0 is empty.

No schema change required. The heuristic is cheap and correct for all realistic states.

### 8. Day colours

Days are auto-assigned colours from a fixed maritime palette cycle (slate-blue, teal,
amber, coral, violet, …). Colours are purely for visual separation of days on the map.
They carry no semantic meaning and are not user-configurable.

---

## Consequences

**Positive**
- Route-first model matches real expedition planning behaviour — no artificial commitment
  to day lengths before the full route is visible.
- Hover-slide bracketing uses only existing Leaflet marker events — no custom geometry
  hit-testing, no drag-and-drop framework.
- Day 0 staging requires no frontend concept of "unassigned" — points simply have a dayId
  that the UI interprets as "not yet bracketed."
- Draft persistence is free: every mutation is already saved. No state machine needed.
- `start_point_id` / `end_point_id` on Day keeps the split-circle marker simple and
  boundary queries O(1) — no linked-list traversal needed to find a day's endpoints.

**Negative / trade-offs**
- §0 backend pre-patch (migration + Day 0 auto-creation) must land before any frontend
  work. Small scope but it is a sequencing constraint.
- Hover-slide requires the full linked list to be client-side so traversal can happen
  without round-trips. The itinerary page fetches all points on load — acceptable for
  realistic expedition sizes (typically < 100 points).
- Day 0 is a persistent DB row, not an in-memory buffer. If itinerary creation fails
  mid-transaction the Day 0 row must be rolled back with it (handled in §0).

**Open questions**
- **Distance unit**: km or nautical miles (nm)? Kayak expeditions typically use nm for
  open-water coastal legs. Decision deferred — introduce a user preference in M7 (profile).
  For M4, display km with an nm annotation.
- **Point type on drop**: should the user assign `stop / position / interest` immediately
  when dropping, or can it default to `position` and be changed later in the point panel?
  Defaulting to `position` reduces friction in the route-first flow. Decide before §4.
- **Maximum points per itinerary**: no hard limit defined. Flag if performance degrades
  beyond ~200 points in testing.
- **Mobile-web responsive interactions**: the hover-slide bracketing, floating panels, and
  map click interactions are designed for pointer devices. Touch equivalents (tap, long-press,
  pinch-zoom) for the web app accessed on mobile browsers need a dedicated design pass.
  This is separate from the React Native app (M9) and applies to the Next.js frontend.
  Discuss before or in parallel with M4 frontend implementation.
