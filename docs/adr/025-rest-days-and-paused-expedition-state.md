# ADR-025: Rest days and paused expedition state

**Status**: accepted  
**Date**: 2026-05-24  
**Supersedes**: partial gap in ADR-011 (trip state machine)

## Context

During M4 development the `Day` model received a nullable `date` field, intentionally
decoupling paddling legs from calendar dates. A day without a date is valid — the paddler
has not yet decided when they will paddle that segment.

This exposed an unmodelled case: a paddler may spend 2–3 consecutive calendar days at a
single location before continuing — a weather hold, resupply stop, or planned rest. The
current data model has no concept of a "rest day" between two paddling legs. The trip state
machine (ADR-011) has no `paused` state.

Two approaches were considered:

**Option A — Rest-day entity**: add a `RestDay` model (date, location, reason) as a sibling
to `Day`. The itinerary has a heterogeneous sequence of paddling legs and rest periods.
Requires UI work in M4/M5, a new backend model, and migration.

**Option B — Multi-date span on Day**: allow each `Day` to carry a `dateFrom`/`dateTo` span
(instead of a single `date`). A rest at the start of a leg is implicit: if Day N ends on the
3rd and Day N+1 starts on the 7th, days 4–6 are at rest. No new model; the gap is inferred.

**Option C — Spare calendar days on the itinerary**: keep `Day` as-is (single date). A
"rest day" is expressed by leaving a gap in the day numbers or repeating a date across
adjacent days. The UI presents the calendar view at the itinerary level and highlights
gaps. No backend change required; complexity moves to the UI.

**Option D — No rest day concept; `paused` trip state only**: the trip state machine gains a
`paused` state (between `happening` and `past`). Rest periods are not tracked at the
itinerary level — they are treated as an expedition-level status. The paddler pauses the
trip (weather hold), resumes it, and the live-tracking timeline reflects the gap. Day dates
remain optional; the gap is visible in the calendar implicitly.

## Decision

**Option D with deferred Option C for planning support.**

For the live expedition use case (M8), a `paused` trip state is the correct semantic:
the trip is neither "happening" (actively paddling) nor "past" (finished). The state
transition is `happening → paused → happening → … → past`. Multiple pause/resume cycles
must be allowed. Only the trip leader can pause or resume.

For the planning use case (itinerary builder, M4–M7): rest days are not tracked
structurally. The day `date` field is optional; gaps between consecutive day dates are
inferred at display time. M7 or a standalone milestone may add Option C (calendar gap
display) if user feedback suggests it is needed.

**State machine amendment (extends ADR-011):**

```
draft → planning → happening ⇄ paused → past
                                        ↗
                             happening ─
```

- `paused` is only reachable from `happening`.
- `paused → happening` is a resume action (leader only).
- `paused → past` is allowed if the leader ends the expedition while paused (e.g. forced
  evacuation).
- All other transitions remain as defined in ADR-011.
- `archived` remains the terminal GDPR-erasure-only state.

## Consequences

**Backend (M8 pre-work):**
- Add `paused` to the `TripState` enum (new Alembic migration).
- `TripStateMachine` gains `pause()` and `resume()` transitions, both leader-only.
- The expedition log auto-generation (ADR-021) must handle paused periods correctly:
  log entry timestamps will have gaps; the total mileage calculation must not span a
  pause boundary incorrectly.

**Frontend (M8):**
- Add pause/resume controls to the live expedition UI (alongside the existing transition
  buttons).
- The state badge (`StateBadge`) gains a `paused` variant with an appropriate token.

**Not in scope for any current milestone:**
- Rest-day entities (Option A).
- Multi-date spans on `Day` (Option B).
- Calendar gap display in the itinerary builder (Option C) — deferred to M7 or later
  based on user feedback.
