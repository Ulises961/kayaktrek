# ADR-022: Float plan sharing — frozen snapshot, opaque token, email notifications

**Status**: accepted  
**Date**: 2026-05-16  
**Supersedes**: ADR-018 §"Float plan delivery" (replaces the placeholder with a concrete design)

## Context

ADR-018 deferred the float plan share link to M8, describing it as "a time-limited read-only
link generated for the shore contact." M3f shipped the float plan leader view and shore contact
form. Before M4 (map builder) the sharing mechanism must be designed concretely because:

1. The `CopyLinkButton` on the float plan page is a dummy — it copies the leader's own
   auth-gated URL, which returns 301/403/404 for any other user.
2. The shore contact email stored on `Logistics` has no delivery mechanism yet.
3. The missed-checkpoint alert (M8 Celery task) needs its email template designed before
   the trigger is wired, otherwise the template will be designed under time pressure.

## Security threat model

Three threats were considered before finalising the design.

### Enumeration / token guessing

`secrets.token_urlsafe(32)` produces 32 bytes of CSPRNG output — 256 bits of entropy,
2²⁵⁶ possible tokens. At 10⁹ guesses per second an attacker would need longer than the age
of the universe to find a single valid token. Enumeration is not a practical concern.

Defence in depth: rate-limit the public endpoint (60 req/min per IP via `flask-limiter`).
This is standard hygiene, not a meaningful security boundary.

### Impersonation / phishing (email spoofing)

An attacker could spoof `no-reply@kayakplanner.app` and send the shore contact a fake
"here is your float plan" email containing a link to a malicious look-alike site. The shore
contact, expecting such an email, might follow the link.

App-layer mitigations:
- The `float_plan_share` email template prominently names the leader ("*Alice Bergström* has
  shared a float plan with you") so the shore contact has a human signal to verify against.
- The CTA button and fallback URL both use the app's canonical domain — the shore contact
  can verify the link goes to the right place.

Domain-level mitigation (pre-production DNS requirement, not code):
- DMARC, DKIM, and SPF must be configured on the sending domain before the app goes live
  with real users. Without these, any sender can spoof the from address. This is listed on
  the pre-production checklist (see `CLAUDE.md` §Production Readiness).

The app cannot fully prevent phishing — domain email authentication is the primary control.

### Medical notes in a public-link snapshot (RESOLVED: excluded)

The initial snapshot design included `TripMember.medical_notes` (the leader-visible plaintext
copy, already unencrypted in the DB) in the JSONB blob. This was rejected for three reasons:

1. **Wider attack surface.** A second plaintext copy in a separate column on a different
   table increases the blast radius of a DB breach.
2. **URL forwarding.** The public link may be forwarded, screenshot, or URL-logged. Medical
   data behind a 256-bit token still has a higher exposure probability than data behind an
   auth-gated session.
3. **Consent revocation cannot redact a frozen blob.** If a crew member revokes medical
   consent, the snapshot cannot be updated without the leader regenerating. Medical data
   in a frozen blob violates the spirit of GDPR Art. 7(3) even if the letter is satisfied
   by a "leader must regenerate" policy.

**Decision: medical notes are excluded from the snapshot entirely.**

The public share URL contains logistical data only — vessel descriptions, emergency contacts,
route dates, shore contact. This is sufficient for search and rescue to identify kayaks and
for the shore contact to know who to call. Medical notes remain in the leader's auth-gated
view exclusively. If the leader must physically convey medical information to the shore
contact (appropriate for serious expeditions), they print the full leader view and hand it
over directly. The printed copy has controlled physical distribution; the public URL does not.

Note: `TripMember.medical_notes_ciphertext/nonce/salt` (AES-GCM, member-visible private
copy) is never written to any snapshot or served to the leader at all. Only
`TripMember.medical_notes` (the explicit consent-to-share plaintext copy) would have been
included — and that exclusion decision above applies to it.

---

## Decision

### Storage: frozen snapshot on `Logistics`

Two new columns on the `logistics` table:

| Column | Type | Notes |
|--------|------|-------|
| `share_token` | `VARCHAR(64) UNIQUE NULL` | `secrets.token_urlsafe(32)` — 43-char URL-safe string |
| `float_plan_snapshot` | `JSONB NULL` | Frozen logistical float plan at generation time |

**No separate table.** The float plan belongs to a trip; the `Logistics` row already owns all
shore-contact and trip coordination data. One share link per trip.

### Snapshot semantics

When the leader generates the link the backend:

1. Fetches the live data: `Trip` (destination, dates), `TripMember` rows with their `user`
   relationship (vessel, emergency contact — **no medical notes**), `Logistics` (shore contact).
2. Serialises into a JSON blob (schema below).
3. Generates a new `share_token` via `secrets.token_urlsafe(32)`.
4. Overwrites both columns on the `Logistics` row atomically.
5. Returns the token.

**Regenerating always overwrites.** The previous token is immediately invalid. The shore
contact's old link stops working. The leader must re-send. This is the intended behaviour —
the leader controls what version the shore contact holds.

The snapshot is a point-in-time record. Changes to `TripMember` data after generation do
**not** propagate. The float plan page shows a "last generated at" timestamp so the leader
knows whether the snapshot is current. See ADR-018 §Consequences for the trade-off reasoning.

### Snapshot JSON schema

```json
{
  "generatedAt": "<ISO 8601 UTC>",
  "trip": {
    "destination": "string | null",
    "dateFrom": "YYYY-MM-DD | null",
    "dateTo": "YYYY-MM-DD | null"
  },
  "shoreContact": {
    "name": "string | null",
    "email": "string | null",
    "phone": "string | null",
    "relationship": "string | null"
  },
  "crew": [
    {
      "name": "string",
      "mail": "string",
      "role": "leader | crew",
      "floatPlanConfirmedAt": "ISO 8601 | null",
      "vessel": {
        "make": "string | null",
        "model": "string | null",
        "lengthCm": "number | null",
        "colorPrimary": "string | null",
        "colorSecondary": "string | null"
      },
      "emergencyContact": {
        "name": "string | null",
        "phone": "string | null",
        "relationship": "string | null"
      }
    }
  ]
}
```

Medical notes are **not** present in this schema. See §Security threat model above.

### Public endpoint — no authentication

```
GET /api/float-plan/public/<token>
```

No JWT required. Returns the raw `float_plan_snapshot` JSON (200) or 404 if the token is
unknown or the snapshot column is null. Rate-limited to 60 req/min per IP.

Registered as a new Blueprint `float_plan_api` at `/api/float-plan` to keep it clearly
separate from auth-gated logistics routes.

### Leader workflow on the float plan page

```
[No link exists]      →  "Generate float plan link"  (single primary action)

[Link exists]         →  "Copy link"  |  "Email shore contact"  |  "↺ Regenerate"  |  Print

[Regenerate clicked]  →  Confirmation dialog:
                         "This will invalidate the previous link.
                          Your shore contact must be sent the new link."
                         [Confirm] [Cancel]

[After regeneration]  →  Dismissible amber banner:
                         "Previous link invalidated — re-send the new link to your shore contact."
```

"Email shore contact" is disabled (with tooltip "Add a shore contact email first") if
`shoreContactEmail` is not set on the Logistics record.

### `share_token` in the logistics API response

`LogisticsSchema` (Marshmallow) adds `share_token` as `dump_only` and `snapshot_generated_at`
(the `updated_at` timestamp of the logistics row, used as the "last generated" display).
The authenticated `GET /api/logistics/<trip_id>` response includes the token so the frontend
can construct the public URL and toggle Generate / Regenerate states without an extra
round-trip.

The `float_plan_snapshot` blob is **not** returned by the logistics endpoint — served only
via the public endpoint.

### Email: `float_plan_share`

Sent when the leader clicks "Email shore contact." Requires `share_token` to exist.

| Key | Value |
|-----|-------|
| Template | `templates/email/float_plan_share` |
| To | `logistics.shore_contact_email` |
| Subject | `Float plan — {destination} ({date range})` |
| Context | `leader_name`, `destination`, `date_label`, `float_plan_url`, `support_email` |

Content: leader's name prominently at the top (phishing signal), what a float plan is, when
to act on it ("if no check-in by the return date, contact emergency services using the
information in this document"), CTA button, plain-text URL fallback.

### Email: `missed_checkpoint`

Template designed now; Celery trigger deferred to M8.

| Key | Value |
|-----|-------|
| Template | `templates/email/missed_checkpoint` |
| To | shore contact email — read from `float_plan_snapshot["shoreContact"]["email"]`, not live `Logistics`, so the email goes to whoever the shore contact was when the float plan was filed |
| Subject | `Check-in overdue — {destination}` |
| Context | `destination`, `date_label`, `checkpoint_name`, `expected_by`, `crew` (list with name + emergency contact), `float_plan_url`, `support_email` |

Tone: informational, not alarming. "A check-in was expected and has not been recorded. This
may be due to limited connectivity. If you are unable to make contact within a reasonable
time, consider alerting the relevant local authorities." The `crew` list gives every
emergency contact inline so the shore contact does not need to open the float plan link to
act.

The `crew` list in the missed-checkpoint email is sourced from `float_plan_snapshot` — it
contains vessel and emergency contact data only (no medical notes), consistent with the
snapshot schema above.

## Consequences

**Positive**
- Medical notes never leave the auth-gated leader view — no plaintext duplication, no
  public-URL exposure, no consent-revocation redaction problem.
- Snapshot gives the shore contact a stable logistical reference that cannot be altered
  mid-expedition.
- Overwrite-on-regenerate: simple model, full leader control, no token list to manage.
- Public endpoint requires zero auth — any device, no account, no cookie.
- `missed_checkpoint` template is ready; M8 only needs to wire the Celery trigger.

**Negative / trade-offs**
- Medical notes are not in the shore contact's link. If the leader wants the shore contact
  to have medical information they must hand over a printed copy of the full leader view.
  This is the correct distribution model for sensitive health data.
- The shore contact's old link breaks silently on regeneration — no automated notification
  to them. The leader is responsible for re-sending.
- DMARC/DKIM/SPF are pre-production DNS requirements, not code. Phishing protection depends
  on domain configuration that must be verified before launch.

**Open questions / deferred**
- **Revocation notice**: if a crew member revokes medical consent after snapshot generation,
  no automated action occurs. UI copy on the revocation confirmation should note that the
  leader may wish to regenerate the float plan link. Post-M3g polish.
- **Token revocation by leader**: no explicit invalidation mechanism beyond regeneration
  (which replaces the token). If the shore contact changes mid-expedition the leader must
  regenerate and re-send. A dedicated "Invalidate link" action could be added post-launch
  without schema changes (null the `share_token` column).
- **Float plan completeness warning**: warn the leader if any crew member is missing vessel
  or emergency contact data before generating. Not in M3g scope (ADR-018 open question).

### Token lifetime — decided

`share_token` expires **30 days after `trip.dateTo`** (or 30 days after generation if
`dateTo` is null). After expiry the public endpoint returns 404.

Rationale: rescue coordination and post-trip debriefs rarely extend beyond a month. An
indefinitely-valid token is a lingering PII exposure (vessel descriptions, emergency contact
phone numbers) for every trip ever run. 30 days is generous for any realistic follow-up
while bounding the exposure window.

Implementation: a `share_token_expires_at` column on `Logistics` (nullable datetime, UTC).
Set at generation time to `max(dateTo, generated_at) + 30 days`. The public endpoint checks
this column and returns 404 if expired — no Celery task required. Expired tokens are not
automatically nulled; they simply become invalid. A Celery periodic task may clean them up
in future, but is not required for correctness.
