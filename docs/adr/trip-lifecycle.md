---
id: trip-lifecycle
title: "Trip Lifecycle: State Machine, Collaboration, Visibility & GDPR"
abstract: Forward-only trip state machine (building→happening→past→archived), leader/crew authority split, itinerary visibility independent of trip privacy, pause/resume, and GDPR erasure with 30-day grace period.
implementation: shipped
status: accepted
date: 2026-06-10
deciders: []
tags: [trip, state-machine, gdpr, collaboration]
---

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

**Map annotations are a second, independent public shape.** Route visibility (above) attaches to `Itinerary`. Community POIs — the `Place` entity that replaced `Point.interest` (landed M4e; see `features.md`, Map Annotations) — are public on their *own* terms, decoupled from any trip or itinerary: a freshwater tap or a good landing beach is community knowledge whether or not anyone has published a route through it. A global annotation (`itinerary_id = null`, `visibility = public`) appears on the landing-page map alongside public itineraries but is not gated by one. Because public contributions need moderation/dedup/edit-trust, this public tier is deferred to the M7 community milestone; trip-scoped annotations (`itinerary_id` set, private) ship first.

---

## Rest days — inferred from calendar gaps, refined M12 §I (2026-07-11)

Rest days are not tracked as a separate entity — a two-part model. The original 2026-05-24
decision only covered the first half; the second was added once M12 §I found that paddlers
overwhelmingly don't reach for the first path:

- **A `Day` entity exists but owns no route points** (an empty slice — its start and end
  boundary resolve to the same point, or it has no points at all). This is a real, explicit
  rest day; no schema change, already representable via the builder's slice model.
- **No `Day` entity exists at all** for one or more calendar dates between two dated real
  days — the actual common path: a paddler just moves a later day's date forward rather than
  opening the builder for the days in between. This is **purely a display-layer inference**,
  not a stored entity: `computeRestGaps` (`lib/itinerary/format.ts`) detects the gap from two
  consecutive dated `Day` rows, and the day list (trip page's Itinerary tab, the builder's day
  rail) renders a non-interactive "Rest" placeholder for each undated calendar day —
  deliberately never a real `Day` row. The codebase has no day-insert-with-renumber capability
  (day creation only ever appends at the end; deletion only ever renumbers downward), and
  building one was explicitly out of scope for this pass — real, paddled days stay exactly as
  they are in the chain. The placeholder's shape (`{ afterDayNumber, date }`) is deliberately
  enough information for a future "promote this gap to a real rest day" action to attach to
  without reworking the detection logic, if that capability is ever added.

The `is_paused` flag (above) handles a different, runtime concept: the expedition is stopped and the next checkpoint window may be missed. A date gap in the itinerary signals deliberate planning; `is_paused` signals an active expedition that has halted. These must not be conflated in the checkpoint-alert logic (M8).

---

## Overnight-stop ownership — single-owner storage, shared display derivation (M12 §M, 2026-07-11)

The point shared between two consecutive days (the overnight stop) is owned by exactly one
`Day` in storage — `apply_boundaries` assigns it to whichever day's boundary is processed last
in the request (day-number order), which in practice is the *later* day. Three frontend
surfaces — the trip page's Itinerary tab, the builder's day rail, and the public/explore route
renderer — each independently derived per-day stats by walking a day's own `points` array, and
all three inherited the same bug: the *earlier*/ending day's own array is missing its own end
boundary, silently understating its distance and dropping its end-stop label.

**Decision: keep single-owner storage (no schema/contract change), fix the display layer with
one shared derivation.** `walkDayRoutePoints` (`lib/itinerary/day-points.ts`) walks a day's
`startPointId` → `nextId` → `endPointId` through a *global* point lookup spanning every day,
rather than that day's own `points` — sidesteps storage ownership entirely, since it never asks
which day owns a given row. All three surfaces now derive from it (falling back to a
chain-head heuristic only for a day with no boundary metadata yet — an organic/fresh day). A
day is inferred as a rest day when this walk resolves to 0 or 1 points.

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

**Doc/code mismatch, flagged not fixed (found 2026-07-20):** the table above says the leader slot is *anonymised* on erasure, but `Tasks.erasure.run_erasure` actually hard-deletes the `User` row outright, which cascades the leader's `TripMember` row away entirely (no ghost "Deleted member" row survives). The archived trip is left with zero `TripMember` rows of any role. This predates the leadership-succession work below and wasn't introduced by it; the succession feature's "no leader" trigger happens to work correctly regardless of which behavior is true (a cascade-deleted row and an anonymised-but-still-`LEADER`-roled row would need different trigger logic — only the former matches today's actual code). Left as a discrepancy to resolve in a future pass, not fixed here.

Revoking medical consent nulls the field on both the `User` record and every `TripMember` row (GDPR Art. 7(3)) — data cannot be retained after withdrawal.

**Re-authentication gate**: deletion requests are confirmed via out-of-band email (the email account acts as a second factor for high-stakes operations), not in-app password re-entry.

**Risk**: national maritime law or coastguard incident reporting requirements may mandate retaining trip records beyond 30 days. Gate the hard-delete on that retention window, not just the grace period. Consult legal before launch.

---

## Leadership succession — nomination and claiming (2026-07-20)

A trip can end up with **zero `LEADER` `TripMember` rows** while remaining fully
visible and partly usable by its remaining crew — every leader-gated action (advance
state, invite, remove members, edit dates) becomes permanently stuck with no
recourse. Two paths produce this today:

1. **Leaving a trip.** `POST /trip/<id>/leave` (any member, self-removal) is
   distinct from `DELETE /trip/<id>` (leader-only, full deletion for everyone —
   previously the same endpoint conflated both behaviors behind a `for_everyone`
   query param with no leader gate on the destructive path, a privilege-escalation
   bug closed by this same change). If the leader leaves and crew remain, the trip
   survives with no leader.
2. **GDPR erasure**, per the doc/code mismatch noted above — the leader's
   `TripMember` row is cascade-deleted, but the trip is also set `archived` in the
   same pass, which the claim trigger below deliberately excludes.

**Trigger**: a trip is claimable when it has no `LEADER` row and its state is not
`archived` — the latter preserves the existing terminal-archival decision above
rather than reopening it.

**Mechanism**: the leader may nominate one crew member as successor at any time
(`TripMember.nominated_successor`, a plain boolean pointer enforced unique per trip
by a partial index — not a second live leader; the medical-notes ECIES model below
assumes exactly one). Once the trip is leaderless: if a successor was nominated,
only they may claim it; otherwise any crew member may (first-come-first-serve). The
claim itself is a row-locked (`SELECT ... FOR UPDATE` on `Trip`) role flip from
`crew` to `leader`, serializing concurrent claim attempts.

**Medical notes on leadership change**: `TripMember.medical_notes_leader_ciphertext`
is ECIES-encrypted to the *specific* leader's X25519 public key at share-time
(see above) — unreadable by whoever claims leadership next. A successful claim
clears it (plus `_nonce`, `_ephemeral_key`, `medical_notes_consent_at`) on **every**
membership in the trip. No new reset-flag/email was added for this, unlike the
password-reset precedent (`medical_notes_reset_at`): clearing `consent_at` alone
already reverts the existing share/not-shared UI state, which is self-explanatory
the next time a member opens the tab — there's no silent data loss to explain,
since the member's own encrypted-at-rest copy (`medical_notes_ciphertext`) is
untouched.

---

## Decision log

| Decision | Original ADR | Date | Notes |
|----------|-------------|------|-------|
| Trip state machine | ADR-011 | 2025-01-01 | Updated 2026-05-10 (logistics editability) and 2026-05-17 (collapse draft/planning → building; pause/resume; date extension) |
| Itinerary visibility independent of trip privacy | ADR-012 | 2025-01-01 | `is_public` on `Itinerary`, not `Trip`; resolves M1 blocker (confirmed in ADR-026) |
| GDPR erasure model | ADR-013 | 2025-03-01 | 30-day grace period; targeted hard-delete |
| Trip collaboration model | ADR-019 | 2026-05-09 | Itinerary: leader-only decided for M4 |
| Rest days and paused expedition state | ADR-025 | 2026-05-24 | Pause/resume on `Trip`; rest days inferred from date gaps. Refined 2026-07-11 (M12 §I): two-part model — empty-slice `Day` = real rest day; a calendar gap with no `Day` row at all = visual-only "Rest" placeholder (`computeRestGaps`), deliberately never promoted to a real entity |
| Community map annotations are a second public shape, independent of `Itinerary` visibility | — | 2026-06-20 | Global POIs (`itinerary_id = null`, `visibility = public`) on the landing map, not gated by a route; public tier deferred to M7; see `features.md` (Map Annotations) |
| Overnight-stop ownership: single-owner storage, shared display derivation | — | 2026-07-11 | M12 §M — `apply_boundaries` assigns the shared boundary point to one day only; `walkDayRoutePoints` (`lib/itinerary/day-points.ts`) is the one shared derivation every per-day distance/label/rest-check now uses, regardless of storage ownership |
| Missed-checkpoint shore-contact alert (D7): a happening trip's most recent `PositionPing` older than `CHECKPOINT_ALERT_HOURS` (default 6, also the re-alert cooldown) on a day it has a scheduled `Day` triggers a non-alarming email to the shore contact — never for paused trips, trips with no Day today, or trips that never opted into live sharing. Deliberately no Day-level "expected checkpoint" flag — reuses the existing `Day` row itself as "a checkpoint was expected today" | M8 §7 | 2026-07-20 | `Tasks/checkpoint_beat_task.py`, hourly beat; `Trip.last_checkpoint_alert_at` is the only new column. Supersedes the original `project_m8_checkpoint_alerts` design-memory framing ("email delivery... deferred to M8") — this is that delivery |
| Leadership succession: nominate-then-claim, trip-wide medical-notes-leader-copy wipe on claim | — | 2026-07-20 | A leaderless, non-archived trip (leader left, or nomination unfulfilled) is claimable by its nominated successor if one exists, else first-come-first-serve by any crew member; bundled a fix for `DELETE /trip/<id>`'s missing `@require_leader` (any crew member could previously pass `for_everyone=true`). Plan: `plans/trip-leadership-succession.md` |
