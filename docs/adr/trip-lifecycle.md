# Trip Lifecycle: State Machine, Collaboration, Visibility & GDPR

This document covers how a trip moves through its lifecycle — what states exist and what they gate, who controls what, how the itinerary's visibility is managed independently of trip privacy, and what happens to the data when the leader is gone.

---

## Trip states — forward-only, leader-controlled

A kayak expedition has a clear lifecycle. The state machine enforces it with a single rule: **transitions are forward-only and only the trip leader can trigger them**.

```
building → happening → past
                         ↓ (GDPR erasure task only)
                      archived
```

| State | Meaning |
|-------|---------|
| `building` | Trip is being prepared. All trip data, crew invitations, itinerary, and logistics are editable. |
| `happening` | Expedition is underway. Triggered manually by the leader. Live position sharing enabled (M8). |
| `past` | Expedition is complete. Read-only. |
| `archived` | Terminal state set **only** by the GDPR erasure Celery task when a deleted leader's trip must be preserved for remaining crew. Never set by a user action. |

The earlier design had two pre-expedition states: `draft` (planning not started) and `planning` (crew confirmed). They were collapsed into `building` because the "invitations closed" rule was never enforced, expedition planning tasks (logistics, crew, route) happen in parallel not in phases, and the `draft → planning` transition gave the leader nothing actionable. Two states with no enforced behavioural difference are one state.

### Date extension during `happening`

Real expeditions are delayed by weather, tides, and logistics. Once a trip is `happening`, the leader may update `trip.date_to` **forward only** (extension only — an earlier date is not allowed). After an extension, the float plan snapshot becomes stale; the frontend must prompt the leader to regenerate the share link (compare `trip.date_to` against the snapshot's `generatedAt`).

### Pause and resume

A `happening` expedition can be paused by the leader (storm delay, injury wait) and resumed later. Pause/resume is a **flag on `Trip`**, not a separate state — keeping the state machine clean.

| Field | Type | Notes |
|-------|------|-------|
| `is_paused` | `BOOLEAN NOT NULL DEFAULT FALSE` | True while the expedition is on hold |
| `paused_at` | `DATE NULL` | Calendar date the pause was triggered |
| `outcome` | `ENUM('completed', 'interrupted') NULL` | Set when transitioning to `past` |

**Pause** (`POST /api/trips/<id>/pause`, leader-only, `happening` only): sets `is_paused = true`, `paused_at = today()`.

**Resume** (`POST /api/trips/<id>/resume`, leader-only, `happening + is_paused` only): leader provides `resumeDate` (defaults to today, must be ≥ `paused_at`). Backend calculates `gap = resumeDate - paused_at` days, shifts every `Day.date` where `day.date > paused_at` forward by that gap, and extends `trip.date_to` by the same gap. `day_number` — the immutable logical sequence position — never changes; only the calendar `date` slides. A gap in calendar dates between consecutive day numbers is intentional and expected.

**Abort** (`POST /api/trips/<id>/abort`, leader-only, `happening + is_paused` only): the only way to reach `past` without resuming. Sets `state = past`, `outcome = interrupted`. One-shot Celery tasks scheduled for the trip must store their task ID so the abort handler can call `celery.control.revoke(task_id, terminate=True)`.

The missed-checkpoint Celery task (M8) skips any trip where `is_paused = true`.

### Logistics editability — date-based, not state-based

Logistics data does not follow a blanket state lock. Items have their own temporal lifecycle:

- **`TravelDocument`**: editable until the earliest of its `date` (check-in, departure) or `expiry_date` (permits, insurance). A hotel booking can be amended the morning of check-in; once both dates have passed, the record is read-only.
- **`Logistics` record** (departure/arrival, shore contact, shuttle): editable during `building` and `happening`; read-only at `past`. Allows last-minute corrections (ferry delayed, shore contact phone updated mid-expedition).
- **`ShuttleVehicle` / `ShuttlePassenger`**: same rule as `Logistics` — editable until the trip transitions to `past`.

Enforcement lives in `TravelDocument.is_editable()` — a single service-layer method that evaluates `min(date, expiry_date) >= today()`. The frontend hides edit controls on expired items and shows a read-only badge.

---

## Collaboration — leader authority vs crew contribution

Write access is split by the nature of the resource.

### Leader-exclusive

| Resource | Reason |
|----------|--------|
| Trip state transitions | Safety authority — only the leader declares the expedition underway or complete |
| Crew add / remove | The leader is responsible for who is on the water |
| `Logistics` structural fields (shore contact, departure/arrival) | The shore contact defines the safety envelope; a crew member must not be able to silently redirect an emergency call |
| Itinerary structure | Route edits are leader-only (see below) |

### Any crew member (including leader)

| Resource | Reason |
|----------|--------|
| `TravelDocument` | The member who made the booking or obtained the permit enters it |
| `ShuttleVehicle` | Any member can create a vehicle and set capacity; they become `arranged_by` |
| `ShuttlePassenger` | Any member can add themselves to a vehicle |
| `TripMember` float plan fields | Personal safety data — only the member themselves can set it |
| `shuttle_notes` / `shuttle_meeting_time` | Operational, not structural |

**Itinerary editability** was an open question at the time ADR-019 was written. The decision for M4 was **leader-only (option a)** as the baseline. Crew members can view and comment on the route (M7+) but cannot move points. Leader-delegated editing rights (`can_edit_itinerary` flag on `TripMember`) is deferred until there is a concrete crew-reported need.

**Ownership and deletion**: a crew member who creates a `TravelDocument` is its owner — they can edit or delete their own record. The leader can edit or delete any record. No crew member can delete another member's record. When the creating member leaves the trip, ownership of their document transfers to the leader automatically (service-layer responsibility).

---

## Itinerary visibility — independent of trip privacy

A trip has two distinct layers of information:
- **Trip data** (crew, logistics, emergency contacts, medical notes): personal and operational; belongs only to the expedition members.
- **Itinerary** (route geometry, points, day structure, distances): paddling knowledge with community value independent of who did the trip.

**An itinerary always belongs to a trip.** There is no standalone itinerary for storage purposes — even a route being planned privately lives inside a `building` trip. However, the itinerary has its own independent visibility:

| Value | Meaning |
|-------|---------|
| `private` | Visible only to leader and crew. Default for all itineraries. |
| `exclusive` | Visible to trip members; shareable via link. Requires Pro subscription (operator tier — scouted routes as commercial IP). If subscription lapses, link sharing is disabled. |
| `public` | Listed in the community route library, visible on the landing page map without authentication, and available for cloning. |

The trip itself is always private — crew lists, emergency contacts, logistics, and medical notes are never exposed publicly regardless of any flag. Visibility belongs on `Itinerary`, not on `Trip`. No `is_public` flag is added to `Trip`. This also resolves the M1 landing page blocker: the public map shows `Itinerary` rows where `is_public = true`, with no trip data attached.

**Route cloning**: copying a public route creates a new trip with a new itinerary pre-populated from the source geometry. The original trip's crew, logistics, and personal data are never accessible or transferred. An optional `created_from_id` FK on the copy tracks lineage for attribution and community deduplication.

---

## Rest days — inferred from calendar gaps

Rest days are not tracked as a separate entity. The `Day.date` field is optional; a gap between consecutive day dates in the calendar is implicitly a planned rest period. This avoids a `RestDay` model, a multi-date span on `Day`, or any additional backend work for a concept that is adequately represented by absence.

The `is_paused` flag (above) handles a different, runtime concept: the expedition is stopped and the next checkpoint window may be missed. A date gap in the itinerary signals deliberate planning; `is_paused` signals an active expedition that has halted. These must not be conflated in the checkpoint-alert logic (M8).

---

## GDPR erasure — soft delete with 30-day grace period

GDPR Article 17 (right to erasure) applies, but a user's data is entangled with other users' data — a trip led by the requesting user may have crew whose history depends on that trip existing. A hard-delete with cascade would destroy other users' data, which itself violates GDPR.

**Flow**:
1. `DELETE /api/user/me` — sets `deletion_requested_at = now()`, `active = False`, revokes all tokens (immediate logout), sends a cancellation email with a one-time token.
2. During the grace period the account cannot be logged into (`403` with `code: "deletion_pending"`).
3. `DELETE /api/user/me/deletion-request` (token-gated cancellation) — clears `deletion_requested_at`, restores `active = True`. Full recovery.
4. A daily Celery beat task hard-deletes users whose `deletion_requested_at` is older than 30 days.

**Erasure contract** — delete everything that belongs only to the user; anonymise only where deletion would destroy another user's data:

| Data | Action |
|------|--------|
| User row | Hard-deleted — no ghost row retained |
| Profile fields (name, email, phone, avatar, vessel, emergency contact, medical notes) | Deleted with the User row |
| Auth tokens | Revoked immediately on deletion request |
| Float plan fields on TripMember rows | Nulled before User row is deleted |
| Trips where user is sole leader and sole member | Cascade-deleted |
| Trips where user is leader and other crew exist | Leader slot anonymised (`"Deleted member"`, contact fields nulled); trip preserved for remaining crew; trip state set to `archived` |
| Trips where user is crew only | TripMember row removed; trip unaffected |
| Personal logs, endorsements, GDPR exports | Deleted |

Revoking medical consent nulls the field on both the `User` record and every `TripMember` row (GDPR Art. 7(3)) — data cannot be retained after withdrawal.

**Re-authentication gate**: deletion requests are confirmed via out-of-band email (the email account acts as a second factor for high-stakes operations), not in-app password re-entry.

**Risk**: national maritime law or coastguard incident reporting requirements may mandate retaining trip records beyond 30 days. Gate the hard-delete on that retention window, not just the grace period. Consult legal before launch.

---

## Decision log

| Decision | Original ADR | Date | Notes |
|----------|-------------|------|-------|
| Trip state machine | ADR-011 | 2025-01-01 | Updated 2026-05-10 (logistics editability) and 2026-05-17 (collapse draft/planning → building; pause/resume; date extension) |
| Itinerary visibility independent of trip privacy | ADR-012 | 2025-01-01 | `is_public` on `Itinerary`, not `Trip`; resolves M1 blocker (confirmed in ADR-026) |
| GDPR erasure model | ADR-013 | 2025-03-01 | 30-day grace period; targeted hard-delete |
| Trip collaboration model | ADR-019 | 2026-05-09 | Itinerary: leader-only decided for M4 |
| Rest days and paused expedition state | ADR-025 | 2026-05-24 | Pause/resume on `Trip`; rest days inferred from date gaps |
