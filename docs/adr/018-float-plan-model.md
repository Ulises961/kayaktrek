# ADR-018: Float plan — aggregate view, consent-gated medical visibility

**Status**: accepted  
**Date**: 2026-05-09

## Context

A float plan is a standard safety practice in sea kayaking: a document left with a trusted
person on shore (the *shore contact*) that describes the expedition in enough detail for that
person — or rescue services — to act if the crew fails to check in or an emergency is declared.

The application must support float plans as a first-class safety feature (ROADMAP: "high
priority — safety feature, not a premium feature"). Several milestones contribute data that
belongs in a float plan:

- **M3d**: vessel info, emergency contact, and medical notes stored on `User` profile and
  pre-populated onto `TripMember` when an invitation is accepted.
- **M3f**: shore contact details and shuttle coordination stored on the `Logistics` record.
- **M8**: check-in schedule, overdue alerts, read-only share link to the shore contact.

## Decision

### The float plan is not a stored entity

It is a computed HTML view assembled on demand from existing models. There is no `FloatPlan`
table. A generation timestamp is rendered on the view so the shore contact and leader know
exactly when it was produced. A printed or saved copy carries that timestamp as its version
marker — if anything changes after printing, the leader re-generates.

The source records are:

| Source | Fields included |
|--------|----------------|
| `Trip` | title, dates, departure/arrival points |
| `Itinerary` | day count, total distance, start/end coordinates, route geometry summary |
| `Logistics` | departure/arrival detail, travel notes, shuttle assignments, shore contact |
| `TripMember` (each crew member) | name, vessel make/model/length/colours, emergency contact name/phone/relationship |
| `TripMember.medical_notes` | **included only if `TripMember.medical_notes_consent_at IS NOT NULL`** |

### Medical notes — copy-on-join, consent-to-share

Medical notes follow a two-step model:

1. **Copy on join**: when a crew member accepts a trip invitation, their `User.medical_notes`
   are always copied to the new `TripMember` row, regardless of consent state. The member
   can view and edit their own `TripMember.medical_notes` at any time — they are personal
   data belonging to the member, not locked away.

2. **Consent to share**: `TripMember.medical_notes_consent_at` is the gate for *visibility to
   the leader and shore contact*. Until the member sets this, their medical notes exist on
   the `TripMember` record but are invisible to the leader and excluded from the float plan.
   Granting consent means: "I agree that the trip leader and shore contact (and by extension,
   emergency services who may consult the float plan) can see my medical notes."

This distinction matters: the member always owns and controls their notes. The consent is
specifically about sharing them upward for safety purposes.

Revoking consent nulls `medical_notes` and `medical_notes_consent_at` on both the `User`
record and all `TripMember` rows for that user (GDPR Art. 7(3)). After revocation the notes
are gone from the system; they will no longer appear in any float plan view.

### Shore contact

Stored on `Logistics` as structured fields — not a free-text string:
`shore_contact_name`, `shore_contact_email`, `shore_contact_phone`,
`shore_contact_relationship`. These are the float plan's delivery address and the target for
overdue alert notifications (M8).

### Float plan delivery

The float plan is an HTML view, rendered server-side, accessible to the trip leader. In M8 a
time-limited read-only link is generated for the shore contact (no account required to view).
If a physical copy is needed the leader prints the HTML view; the generation timestamp on the
page serves as the version marker.

The float plan is accessible during `planning` and `happening` states. Visible only to the
trip leader and the shore contact link holder — never publicly accessible regardless of
itinerary visibility (ADR-012).

## Consequences

**Positive**
- No data duplication: all float plan data lives in its canonical model; the view assembles it
- Members own their medical notes and can update them independently of whether they have
  granted consent — consent is purely a visibility gate, not a storage gate
- Shore contact as a structured record enables M8 to send automated overdue alerts to a
  validated email address without any additional model changes
- HTML view with a generation timestamp is simpler than PDF generation and renders correctly
  on any device the shore contact uses

**Negative / trade-offs**
- If a crew member updates their `TripMember.medical_notes` after the leader has printed the
  float plan, the printed copy is stale. The generation timestamp on the page makes this
  visible. The leader should re-generate and re-share before departure if any member updates
  their notes.
- If a member revokes consent after a link has been shared with the shore contact, the live
  HTML view will immediately no longer show their notes (the view is computed at request time).
  This is the correct behaviour — revocation is immediate. If the shore contact has printed
  a copy, that copy cannot be retroactively updated; document this in the revocation
  confirmation message.

**Risks / open questions**
- **Float plan completeness check**: surface a warning to the leader before sharing if any
  crew member has not filled in vessel info, emergency contact, or has not granted medical
  consent. Empty sections in the float plan are gaps that matter in an emergency.
- **Itinerary fields in the float plan**: define exactly which fields are included before M8.
  Point notes may contain personal observations — exclude them unless the leader opts in.
- **Time zone**: the generation timestamp is UTC; display it in the leader's locale with an
  explicit UTC offset so the shore contact and emergency services can interpret it unambiguously.
