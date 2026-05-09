# ADR-011: Trip state machine (forward-only transitions, leader-only)

**Status**: accepted
**Date**: 2025-01-01

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

## Consequences

**Positive**
- Simple to reason about: each state has a clear meaning and a defined set of allowed operations
- Enforced at the service layer — no state can be bypassed by crafting an API request
- `archived` cleanly handles the GDPR edge case without polluting the normal lifecycle

**Negative / trade-offs**
- No rollback: if a leader advances the state by mistake, there is no self-service undo. An admin operation would be needed to correct it.
- `draft` → `planning` transition semantics (what exactly changes, what is locked) are not yet fully specified — will need definition before M3c ships

**Risks / open questions**
- Define what is locked at each state transition before M3c: can the itinerary be edited during `planning`? Can crew be changed during `happening`?
- `archived` state is not yet surfaced in the UI — decide whether archived trips appear in the crew members' trip lists (they should, as read-only history)
