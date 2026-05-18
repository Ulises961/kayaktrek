# ADR-011: Trip state machine (forward-only transitions, leader-only)

**Status**: accepted  
**Date**: 2025-01-01  
**Updated**: 2026-05-10 — Reservation/Document merged into TravelDocument; editability rule updated accordingly  
**Updated**: 2026-05-17 — Collapsed `draft`/`planning` into `building`; added `date_to` extension rule during `happening`; added pause/resume mechanism with day-date sliding

## Context

A kayak expedition has a clear lifecycle: it is planned, then it happens, then it is over. The application needs to model this in a way that:
- Prevents nonsensical transitions (a past trip cannot be restarted)
- Restricts who can move a trip through states (only the leader decides when an expedition starts)
- Supports an exceptional terminal state for GDPR erasure cases

### Why `draft` and `planning` were collapsed

The original design had two pre-expedition states: `draft` (building, invitations not yet sent) and `planning` (crew confirmed, invitations closed). In practice:

1. The "invitations closed" rule was never enforced — crew could be invited in both states.
2. Expedition planning is not sequential: logistics bookings, itinerary building, and crew management happen in parallel, not in phases.
3. The transition from `draft` to `planning` added no meaningful gate and gave the leader nothing actionable.

Two states with no enforced behavioural difference are one state. They were collapsed into `building`.

## Decision

Trip state is a forward-only state machine with three active states and one terminal state:

```
building → happening → past
                         ↓ (GDPR erasure only)
                      archived
```

- **`building`**: trip exists and is being prepared. Leader can edit all trip data, manage crew invitations, build the itinerary, and update logistics freely.
- **`happening`**: expedition is underway. Triggered manually by the leader. Live position sharing enabled (M8). `date_to` may be extended (see below).
- **`past`**: expedition is complete. Read-only.
- **`archived`**: terminal state set only by the GDPR erasure Celery task when a deleted leader's trip must be preserved for remaining crew members. Never set by a user action.

Rules:
- Transitions are forward-only — no rollback.
- Only the trip leader can call `POST /api/trips/<id>/state`.
- `archived` is unreachable from the normal state machine; it is set directly by the erasure task.

### `date_to` extension during `happening`

Real expeditions are delayed by weather, tides, and logistics. Once a trip is `happening`, the leader may update `trip.date_to` forward (extension only — setting an earlier date is not allowed).

When the leader extends `date_to`:
- The float plan snapshot is stale (it contains the old `dateTo`). The frontend must prompt the leader to regenerate the share link.
- The `share_token_expires_at` on the old token does not change automatically. Regenerating the link resets the expiry to `new_date_to + 15 days`.

### Pause and resume during `happening`

A `happening` expedition may be paused by the leader (storm delay, injury wait, logistical hold) and later resumed. This is modelled as a flag on `Trip`, not a separate state, keeping the state machine clean.

**New fields on `Trip`:**

| Field | Type | Notes |
|-------|------|-------|
| `is_paused` | `BOOLEAN NOT NULL DEFAULT FALSE` | True while the expedition is on hold |
| `paused_at` | `DATE NULL` | Calendar date the pause was triggered |

**Pause** (`POST /api/trips/<id>/pause`, leader-only, only in `happening` state):
- Sets `is_paused = true`, `paused_at = today()`
- Does not advance state

**Resume** (`POST /api/trips/<id>/resume`, leader-only, only in `happening + is_paused` state):
- Leader provides `resumeDate` (defaults to today; must be ≥ `paused_at`)
- Backend calculates `gap = resumeDate - paused_at` (in days)
- Shifts the `date` of every `Day` where `day.date > paused_at` forward by `gap` days
- Sets `is_paused = false`, `paused_at = null`
- Also extends `trip.date_to` by `gap` days automatically

**Day number is the immutable logical key.** `dayNumber` never changes — it is the sequence position within the itinerary. Only the calendar `date` slides. A gap in calendar dates between two consecutive day numbers is intentional and expected when a pause has occurred.

**Checkpoint alert suppression.** The missed-checkpoint Celery task (M8) skips any trip where `is_paused = true`. False alarms during the pause window are avoided entirely.

**Float plan staleness.** After a resume that shifts days and extends `date_to`, the float plan snapshot is stale. The frontend detects this by comparing `trip.date_to` against `snapshotGeneratedAt` and prompts the leader to regenerate the share link.

### Aborting a paused expedition

A paused expedition may be definitively ended by the leader via an **Abort** action. This is the only way to transition from `happening` to `past` without resuming — and it is only available when `is_paused = true`.

**New field on `Trip`:**

| Field | Type | Notes |
|-------|------|-------|
| `outcome` | `ENUM('completed', 'interrupted') NULL` | Set when transitioning to `past`. Null while trip is active. |

**Abort** (`POST /api/trips/<id>/abort`, leader-only, only in `happening + is_paused` state):
- Sets `state = past`, `outcome = interrupted`
- Sets `is_paused = false`, `paused_at = null`
- Cancels queued Celery tasks for the trip (see below)

**Frontend.** The abort button appears on the trip detail page only when the trip is `happening` and `is_paused = true`. It is a destructive action — show a confirmation dialog: *"This will permanently end the expedition and cannot be undone."* Visually distinct from Resume (destructive red vs. primary).

**Celery task cleanup.** Periodic tasks (e.g. the nightly missed-checkpoint scan) check `trip.state` and `trip.is_paused` at execution time and no-op on `past` trips — no revocation needed. One-shot tasks scheduled for a specific trip (e.g. a checkpoint alarm scheduled for a future date) must store their Celery task ID on the relevant model row so the abort handler can call `celery.control.revoke(task_id, terminate=True)`. M8 must store task IDs when scheduling one-shot tasks.

### Logistics editability

Logistics data (the `Logistics` record, `TravelDocument`, `ShuttleAssignment`) follows a **date-based editability rule** rather than a blanket state lock:

- **`TravelDocument`**: editable until the earliest relevant date that is set has passed. `date` covers bookings (check-in, departure); `expiry_date` covers permits and insurance. If only one is set, that date governs. If neither is set, the document is editable until the trip reaches `past`. A hotel booking can still be amended the morning of check-in; a park permit can be corrected until it expires. Once the governing date has passed the record becomes read-only.
- **`Logistics` record** (departure/arrival points, shore contact, shuttle info): editable during `building` and `happening` for operational adjustments (e.g. updating the shore contact's phone number mid-trip). Becomes read-only at `past`.
- **`ShuttleVehicle` and `ShuttlePassenger`**: follow the same rule as the `Logistics` record — editable until the trip transitions to `past`. Capacity fields (`seats_available`, `kayak_spots`) may need updating right up to departure day as plans change.

Rationale: logistics items have their own temporal lifecycle independent of the trip state. Blocking edits at `happening` would prevent legitimate last-minute corrections (ferries delayed, accommodation changed). The trip state machine governs the expedition lifecycle; individual item dates govern their own editability window.

Enforcement: the service layer evaluates `min(date, expiry_date) >= today()` (ignoring null fields) before allowing mutations on `TravelDocument`. The frontend hides edit controls on expired items and shows a read-only badge.

**Note — M3f model consolidation (2026-05-10):** `Reservation` and `Document` were originally planned as separate entities. They were merged into a single `TravelDocument` entity before implementation. The original distinction was an implementation artifact: a ferry ticket is simultaneously a reservation and a document. The unified type enum (`accommodation | transport | insurance | permit | other`) covers all cases. One `TravelDocument` record maps to one file attachment; multiple files for one booking are modelled as separate records.

## Consequences

**Positive**
- Three states, each with a distinct meaning and a clear gate between them.
- `building` covers the full pre-expedition lifecycle without artificial phase splits.
- Crew invitations, itinerary building, and logistics can proceed in any order — no state advancement required.
- `date_to` extension in `happening` reflects real expedition conditions without reopening the state machine.
- `archived` cleanly handles the GDPR edge case without polluting the normal lifecycle.
- Date-based editability mirrors real-world logistics: you can call the hotel until check-in, not until departure.

**Negative / trade-offs**
- Migration required: existing `draft` and `planning` rows must be updated to `building`. The DB enum must be updated. All backend and frontend references to the old state names must be replaced.
- No rollback from `happening`: if a leader advances the state by mistake, an admin operation is needed to correct it.
- Date-based editability requires the service layer to compare against `today()` on every mutation — use `TravelDocument.is_editable()` to centralise this check and avoid clock-skew bugs.

**Risks / open questions**
- `archived` state is not yet surfaced in the UI — decide whether archived trips appear in the crew members' trip lists (they should, as read-only history).
- Time zones: `reservation.date` is a date (no time component) — compare against the server's UTC date. Acceptable for now; revisit if operators in distant time zones report off-by-one issues at midnight.
- Float plan staleness warning when `date_to` is extended during `happening`: frontend logic needed (compare `trip.date_to` against `snapshotGeneratedAt`).
