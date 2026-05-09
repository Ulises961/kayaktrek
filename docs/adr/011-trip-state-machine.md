# ADR-011: Trip state machine (forward-only transitions, leader-only)

**Status**: accepted  
**Date**: 2025-01-01  
**Updated**: 2026-05-09 — logistics editability rules added

## Context

A kayak expedition has a clear lifecycle: it is planned, then it happens, then it is over. The application needs to model this in a way that:
- Prevents nonsensical transitions (a past trip cannot become a draft again)
- Restricts who can move a trip through states (only the leader decides when an expedition starts)
- Supports an exceptional terminal state for GDPR erasure cases

## Decision

Trip state is a forward-only state machine with four active states and one terminal state:

```
draft → planning → happening → past
                                 ↓ (GDPR erasure only)
                              archived
```

- **`draft`**: trip exists, leader is building it. Crew invitations not yet sent.
- **`planning`**: crew is confirmed, logistics are being finalised. Invitations closed.
- **`happening`**: expedition is underway. Live position sharing enabled (M8).
- **`past`**: expedition is complete. Read-only.
- **`archived`**: terminal state set only by the GDPR erasure Celery task when a deleted leader's trip must be preserved for remaining crew members. Never set by a user action.

Rules:
- Transitions are forward-only — no rollback.
- Only the trip leader can call `POST /api/trips/<id>/state`.
- `archived` is unreachable from the normal state machine; it is set directly by the erasure task.

### Logistics editability

Logistics data (the `Logistics` record, `Reservation`, `Document`, `ShuttleAssignment`) follows a **date-based editability rule** rather than a blanket state lock:

- **`Reservation` and `Document`**: editable by the trip leader until their scheduled date (`reservation.date`, `document.expiry_date`) has passed. A hotel reservation can still be amended the morning of check-in; a flight booking can be updated until departure day. Once the date has passed the record becomes read-only.
- **`Logistics` record** (departure/arrival points, shore contact, shuttle info): editable during `draft` and `planning`. Remains editable through `happening` for operational adjustments (e.g. updating the shore contact's phone number mid-trip). Becomes read-only at `past`.
- **`ShuttleAssignment`**: follows the same rule as the `Logistics` record — editable until the trip transitions to `past`.

Rationale: logistics items have their own temporal lifecycle independent of the trip state. Blocking edits at `happening` would prevent legitimate last-minute corrections (ferries delayed, accommodation changed). The trip state machine governs the expedition lifecycle; individual item dates govern their own editability window.

Enforcement: the service layer checks `item.date >= today()` before allowing mutations on `Reservation` and `Document`. The frontend hides edit controls on expired items and shows a read-only badge.

## Consequences

**Positive**
- Simple to reason about: each state has a clear meaning and a defined set of allowed operations
- Enforced at the service layer — no state can be bypassed by crafting an API request
- `archived` cleanly handles the GDPR edge case without polluting the normal lifecycle
- Date-based editability mirrors real-world logistics: you can call the hotel until check-in, not until departure

**Negative / trade-offs**
- No rollback: if a leader advances the state by mistake, there is no self-service undo. An admin operation would be needed to correct it.
- Date-based editability requires the service layer to compare against `today()` on every mutation — introduce a `LogisticsItem.is_editable()` helper to centralise this check and avoid clock-skew bugs.

**Risks / open questions**
- `archived` state is not yet surfaced in the UI — decide whether archived trips appear in the crew members' trip lists (they should, as read-only history)
- Time zones: `reservation.date` is a date (no time component) — compare against the server's UTC date. Acceptable for now; revisit if operators in distant time zones report off-by-one issues at midnight.
