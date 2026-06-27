---
id: safety-privacy
title: "Safety & Privacy: Float Plan, Medical Notes & Sharing"
abstract: Float plan as computed view (no FloatPlan table), medical notes with copy-on-join + ECIES E2E encryption for leader-visible copy, frozen snapshot sharing via opaque token with 30-day post-trip expiry.
status: accepted
date: 2026-06-10
deciders: []
tags: [safety, privacy, encryption, float-plan]
---

# Safety & Privacy: Float Plan, Medical Notes & Sharing

This document covers the float plan — the primary safety document for a sea kayaking expedition — and the privacy model that governs the sensitive data it contains. The float plan is treated as a safety-first feature, not a premium one.

---

## The float plan as a computed view

A float plan is a standard safety practice in sea kayaking: a document left with a trusted person on shore (the *shore contact*) that describes the expedition in enough detail for that person — or rescue services — to act if the crew fails to check in or an emergency is declared.

**There is no `FloatPlan` table.** The float plan is a computed HTML view assembled on demand from existing models. All float plan data lives in its canonical location; the view gathers it. A generation timestamp is rendered on the view so the shore contact and leader know when it was produced — a printed or saved copy carries that timestamp as its version marker.

| Source | Fields included |
|--------|----------------|
| `Trip` | Title, dates, departure/arrival points |
| `Itinerary` | Day count, total distance, start/end coordinates, route summary |
| `Logistics` | Departure/arrival detail, travel notes, shuttle assignments, shore contact |
| `TripMember` (each crew member) | Name, vessel make/model/length/colours, emergency contact name/phone/relationship |
| `TripMember.medical_notes` | Included only if `medical_notes_consent_at IS NOT NULL` — see below |

The float plan is accessible during `building` and `happening` states. It is visible only to the trip leader and the shore contact link holder — never publicly accessible regardless of itinerary visibility.

The shore contact is stored as structured fields on `Logistics` — not a free-text string: `shore_contact_name`, `shore_contact_email`, `shore_contact_phone`, `shore_contact_relationship`. Structured fields enable the missed-checkpoint email alert (M8) to reach a validated address without additional model changes.

---

## Medical notes — two-step model: copy on join, consent to share

Medical notes follow a carefully designed two-step model that keeps personal data fully under the crew member's control while enabling leaders to access it for safety purposes.

**Step 1 — Copy on join**: when a crew member accepts a trip invitation, their `User.medical_notes` are always copied to the new `TripMember` row, regardless of consent state. The member can view and edit their own `TripMember.medical_notes` at any time — these are personal data belonging to the member, not locked away.

**Step 2 — Consent to share**: `TripMember.medical_notes_consent_at` is the gate for *visibility to the leader and shore contact*. Until the member sets this, their notes exist on the record but are invisible to the leader and excluded from the float plan. Granting consent means: "I agree that the trip leader and shore contact — and by extension, emergency services who may consult the float plan — can see my medical notes."

Revoking consent nulls `medical_notes` and `medical_notes_consent_at` on **both** the `User` record and all `TripMember` rows for that user (GDPR Art. 7(3)). After revocation the notes are gone from the system. If the shore contact has already printed a copy, that copy cannot be retroactively updated — document this in the revocation confirmation message.

---

## End-to-end encryption of the leader-visible copy

The original design wrote a plaintext copy of medical notes to `TripMember.medical_notes` when a member consented to share. This was a deviation from the established pattern (`User.medical_notes` has always been stored as ciphertext, decrypted in-memory). A plaintext column on `TripMember` exposed consented notes to any actor with database read access — DB admin, backup leak, SQL injection.

The fix: **ECIES encryption** (X25519 key agreement + AES-GCM). No new dependency — the `cryptography` library already installed supports X25519 and HKDF.

### Keypair model

Each `User` gets an X25519 keypair generated at registration:

- **Private key**: encrypted at rest using AES-GCM with a PBKDF2-derived key from the user's password. Stored as `private_key_ciphertext/nonce/salt` on `User`. A password change re-encrypts only the 32-byte private key blob — the keypair itself does not change, and no downstream ciphertext is affected.
- **Public key**: stored base64-encoded in `User.public_key`. No access control required.

Generating a random keypair (rather than deriving it from the password) decouples key rotation from password changes.

### Encryption (member → leader)

When the member calls `share_medical_notes`:

1. Decrypt the member's private copy with their password.
2. Fetch the leader's `public_key`.
3. Generate an ephemeral `X25519PrivateKey`.
4. Compute shared secret: `ephemeral_private.exchange(leader_public_key)`.
5. Derive a symmetric key: `HKDF(shared, salt=b"float-plan-medical", hash=SHA256)`.
6. Encrypt: `AESGCM(derived_key).encrypt(nonce, plaintext, None)`.
7. Store on `TripMember`: `medical_notes_leader_ciphertext`, `medical_notes_leader_nonce`, `medical_notes_leader_ephemeral_key`. Plaintext is never written to the database.

### Decryption (leader reads)

Leader calls `POST /api/trip/<id>/member/<member_id>/medical-notes` with their password. The backend decrypts the leader's private key, reconstructs the ephemeral public key, computes the shared secret with the same HKDF parameters, and decrypts in memory. Plaintext is returned in the response body and never written to the database.

The `TripMemberSchema` exposes `has_leader_medical_notes` (boolean) — the leader knows notes exist but cannot read them without providing their password through this dedicated endpoint.

### Schema changes

**`User` additions**: `public_key TEXT NULL`, `private_key_ciphertext TEXT NULL`, `private_key_nonce STRING(32) NULL`, `private_key_salt STRING(32) NULL`.

**`TripMember` changes**: `medical_notes TEXT` column dropped; `medical_notes_leader_ciphertext TEXT NULL`, `medical_notes_leader_nonce STRING(32) NULL`, `medical_notes_leader_ephemeral_key STRING(64) NULL` added.

Users registered before this feature deployed have `public_key = NULL`. On their next login the frontend detects `hasKeypair: false` and prompts for a one-time keypair generation. Existing `TripMember.medical_notes` plaintext rows are nulled in the migration.

### Password reset — unavoidable data loss

A keypair's private key (and `User.medical_notes_ciphertext`) is wrapped with a key derived from the user's password. A **password change** can re-wrap it because the old password is supplied. A **forgot-password reset** cannot — the old password is gone, so the wrapped key is permanently undecryptable. `reset_password` therefore clears the keypair and all medical-notes ciphertext; holding orphaned, unreadable ciphertext would only mislead the UI.

The data loss is unavoidable, so the design makes it **visible and recoverable** rather than silent:

- When a reset actually wiped notes (`medical_notes_ciphertext` was non-null), `User.medical_notes_reset_at` is stamped and a `medical_notes_cleared` email is sent. Users who never stored notes are neither flagged nor emailed.
- `medical_notes_reset_at` is exposed via `UserSchema` (`medicalNotesResetAt`, dump-only). The profile medical section and the trip float-plan medical tab render a re-entry prompt while it is set.
- Re-entering notes (`grant_medical_consent`) or explicitly opting out (`revoke_medical_consent`) clears the flag.

This was deliberately chosen over the alternative of prompting the user to re-enter notes *during* the reset flow, which would require holding plaintext through an unauthenticated reset — a worse security posture.

---

## Float plan sharing — frozen snapshot, opaque token

The float plan leader view is auth-gated. The shore contact needs a link that works without an account. This requires a concrete sharing mechanism.

### Security threat model

Three threats were evaluated:

1. **Token enumeration**: `secrets.token_urlsafe(32)` produces 256 bits of entropy. Enumeration is not a practical concern. The public endpoint is additionally rate-limited (60 req/min per IP) as standard hygiene.

2. **Email spoofing / phishing**: mitigated at the app layer by displaying the leader's name prominently in the share email ("*Alice Bergström* has shared a float plan with you") and by using the app's canonical domain in all URLs. Domain-level mitigation (DMARC, DKIM, SPF) is a pre-production DNS requirement — without these, any sender can spoof the from address. Listed on the pre-production checklist.

3. **Medical notes in the snapshot**: initially the design included the leader-visible medical copy in the snapshot JSON. This was rejected: a second plaintext copy increases blast radius on DB breach; a public URL may be forwarded or URL-logged; and consent revocation cannot redact a frozen blob (violates GDPR Art. 7(3)). **Medical notes are excluded from the snapshot entirely.** The public share URL contains logistical data only — vessel descriptions, emergency contacts, route dates, shore contact. This is sufficient for search and rescue to identify kayaks and for the shore contact to know who to call.

### Storage — frozen snapshot on `Logistics`

Two new columns on the `logistics` table:

| Column | Type | Notes |
|--------|------|-------|
| `share_token` | `VARCHAR(64) UNIQUE NULL` | `secrets.token_urlsafe(32)` — 43-char URL-safe string |
| `share_token_expires_at` | `DATETIME NULL` | Set to `max(trip.dateTo, generated_at) + 30 days` |
| `float_plan_snapshot` | `JSONB NULL` | Frozen logistical float plan at generation time |

**Regenerating always overwrites.** The previous token is immediately invalid; the shore contact's old link stops working. The leader must re-send. One share link per trip; no token list to manage.

The snapshot is a point-in-time record. Changes to `TripMember` data after generation do not propagate. The float plan page shows a "last generated at" timestamp so the leader can judge whether it is current.

### Snapshot JSON schema

```json
{
  "generatedAt": "<ISO 8601 UTC>",
  "trip": { "destination", "dateFrom", "dateTo" },
  "shoreContact": { "name", "email", "phone", "relationship" },
  "crew": [
    {
      "name", "mail", "role",
      "floatPlanConfirmedAt",
      "vessel": { "make", "model", "lengthCm", "colorPrimary", "colorSecondary" },
      "emergencyContact": { "name", "phone", "relationship" }
    }
  ]
}
```

Medical notes are not present. See threat model above.

### Public endpoint

```
GET /api/float-plan/public/<token>
```

No JWT required. Returns the raw snapshot JSON (200) or 404 if the token is unknown, the snapshot is null, or the token is expired. Registered as a separate Blueprint to keep it clearly distinct from auth-gated logistics routes.

### Leader workflow

```
[No link exists]   →  "Generate float plan link"

[Link exists]      →  "Copy link" | "Email shore contact" | "↺ Regenerate" | Print

[Regenerate]       →  Confirmation dialog: "This will invalidate the previous link."
                       → amber banner after: "Previous link invalidated — re-send to shore contact."
```

### Email templates

**`float_plan_share`**: sent when the leader clicks "Email shore contact." Leader's name at the top (phishing signal), explanation of what a float plan is and when to act on it, CTA button, plain-text URL fallback.

**`missed_checkpoint`**: template designed now; Celery trigger wired in M8. Sent to `float_plan_snapshot["shoreContact"]["email"]` — the shore contact as of when the float plan was filed, not the live `Logistics` value (ensures the email goes to whoever received the document). Tone: informational, not alarming. Inline crew list with emergency contacts so the shore contact can act without opening the link. Crew list sourced from `float_plan_snapshot` (vessel + emergency contact data, no medical notes).

---

## Token lifetime

`share_token` expires 30 days after `trip.dateTo` (or 30 days after generation if `dateTo` is null). After expiry the public endpoint returns 404. Rationale: rescue coordination and post-trip debriefs rarely extend beyond a month; an indefinitely-valid token is a lingering PII exposure (vessel descriptions, emergency contacts) for every trip ever run.

Expired tokens are not automatically nulled — they simply return 404. A Celery periodic cleanup task may null them in future but is not required for correctness.

---

## Enumeration & oracle hardening (M7a §4)

The 2026-06-11 security review flagged a cluster of LOW-severity enumeration/oracle items to revisit
once a discoverable public surface (the public profile, M7a) ships. Their status after M7a §4:

- **Login timing oracle — closed (pre-M7a).** `authenticate_user` runs a dummy bcrypt
  (`_DUMMY_HASH`) when the account is absent, so present vs. absent accounts take the same time.
  Extended in M7a to also dummy-hash is unnecessary because the password is now always verified
  against a real-or-dummy hash on every path.
- **`deletion_pending` disclosure — closed (M7a §4).** A deletion-pending account is also
  `active = False`. Previously `authenticate_user` raised the distinct `deletion_pending`
  `PermissionError` *before* verifying the password, letting an unauthenticated attacker probe which
  addresses are mid-deletion. Fixed by verifying the password **first**; the actionable
  `deletion_pending` 403 is only returned to a caller who proves the password (so a legitimate owner
  can still cancel), while any wrong-password probe gets the generic 401.
- **Registration "email taken" disclosure — closed (pre-M7a).** `register_user` returns the same
  generic "check your inbox" response whether or not the address exists; an existing address instead
  receives an `account_already_registered` email.
- **GPX XXE/billion-laughs — closed (pre-M7a).** `import_gpx` pre-validates with
  `defusedxml.ElementTree.fromstring` before handing the document to `gpxpy`, plus a 5 MB size cap.
- **403-vs-404 authorization oracle — consciously declined (M7a §4).** `require_owner` keeps
  returning **403** ("access denied") for a cross-tenant resource that exists, rather than masking it
  as 404. Rationale: every resource ID is a UUIDv7 (122 bits, non-enumerable) behind full auth
  gating, so an attacker can only reach this branch with an ID they were already given (a share link,
  a former membership, a leaked URL) — in which case the 403 confirms nothing they don't already
  know. For genuinely shared resources (a removed crew member re-hitting a trip), 403 is also the
  more correct and useful response than a misleading 404. The change would have been a broad
  API-contract churn (~6–8 test files) for negligible real secrecy. Revisit only if an enumerable
  surface (e.g. sequential IDs or a public listing of private resource IDs) is ever introduced.

---

## Decision log

| Decision | Original ADR | Date | Notes |
|----------|-------------|------|-------|
| Float plan as computed view | ADR-018 | 2026-05-09 | No `FloatPlan` table; copy-on-join + consent-to-share model |
| Float plan sharing — frozen snapshot | ADR-022 | 2026-05-16 | Supersedes ADR-018 §"Float plan delivery"; medical notes excluded from snapshot |
| Medical notes ECIES encryption | ADR-023 | 2026-05-16 | Amends ADR-018 §"Medical notes — copy-on-join, consent-to-share"; plaintext column dropped |
| Password-reset medical-notes data loss — notify + re-entry prompt | — | 2026-06-16 | Reset clears unreadable ciphertext; `medical_notes_reset_at` flag + `medical_notes_cleared` email + in-app prompt; rejected re-entry during the reset flow (would hold plaintext unauthenticated). Closes 2026-06-11 security review Step 4. |
| Enumeration/oracle hardening (M7a §4) | — | 2026-06-25 | Closed login-timing, `deletion_pending`-before-password, registration, and GPX-XXE oracles; **consciously declined** the 403→404 `require_owner` flip (non-enumerable UUIDv7 + auth gating make the oracle non-exploitable; 403 is more correct for shared resources). Closes the 2026-06-11 review's deferred LOW items. |
