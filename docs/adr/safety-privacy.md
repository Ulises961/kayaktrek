---
id: safety-privacy
title: "Safety & Privacy: Float Plan, Medical Notes & Sharing"
abstract: Float plan as computed view (no FloatPlan table), medical notes with copy-on-join + client-side ECIES encryption for the leader-visible copy (password-derived key, never sent to the server — M22 made this genuinely zero-knowledge) but PARKED since 2026-09-02 and not offered, frozen snapshot sharing via opaque token with 30-day post-trip expiry.
implementation: shipped; medical notes parked 2026-09-02 (see "Parked")
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

## Parked (2026-09-02)

**Everything below about medical notes describes a feature that is built, tested, and not
offered.** Read the rest of this document as a design record, not as a description of what
the running app does.

The decision: the feature carries real legal weight — GDPR Art. 9 special-category health
data, a Play Data-safety declaration, a section of the privacy policy — in exchange for a
convenience on an app that is not yet in alpha. Nothing else in the product is load-bearing
on it. That trade is wrong at this stage, and it is wrong in a way that gets *worse* with
every tester who stores something, because parking later means deleting more.

Parking is not dropping. The work stays in the repository in full and is unparked by an
environment variable:

| Layer | Gate | Off by default |
|-------|------|----------------|
| Backend | `MEDICAL_NOTES_ENABLED` (`Api/features.py`, `Api/config.py`) | All nine endpoints 404, ahead of auth; the paths leave the OpenAPI contract |
| Frontend | `NEXT_PUBLIC_MEDICAL_NOTES` (`lib/features.ts`) | Profile section, float-plan tab section, leader's crew-manifest viewer, and keypair prompt banner all stop rendering |
| Data | migration `e7a2c40d9b13` | Stored notes, consent timestamps, and the access log are purged; keypairs are kept |

Four things worth knowing about the shape of it:

- **404, not 403.** A parked endpoint should look like one that was never built. The gate
  sits above the auth decorators so an anonymous probe and an authenticated one get the
  same answer — a route that 403s for one and 404s for the other still advertises itself.
- **Both flags are needed.** Hiding a control does not stop an endpoint accepting data, and
  a live control calling a 404 endpoint is a broken page rather than a parked feature.
- **Keypairs are deliberately kept**, and registration still generates one silently. They
  are generic X25519 material, not health data. Dropping them would make unparking a
  migration plus a re-key prompt for every existing account instead of one variable, and
  would break the password-change rewrap path for no benefit.
- **The test suites force the flag on** (`TestingConfig`, `vitest.config.ts`, the dev/e2e
  compose stack and `run-live-stack.sh`) so that parking the feature does not quietly stop
  testing it. The flag-*off* path has its own file on each side
  (`Tests/81_medical_notes_parked_test.py`, `lib/__tests__/features-parked.test.tsx`).

The privacy policy's health-data section was removed rather than marked unavailable, and
section 2 now states plainly that the Service does not collect health data. **A policy
describing processing the app does not perform is a liability, not a courtesy** — and the
flag, not the presence of code in the repository, is what determines which is true. If the
feature is unparked, that section has to come back in the same change.

This also settles, for now, M9's open question of whether medical notes sync to the device
(`docs/adr/mobile-offline.md`) — there is nothing to sync — and removes Health info from
the Play Data-safety declaration (`docs/play-store-checklist.md` §3b). Both reopen on
unparking, and the mobile question reopens unresolved: parking sidesteps it rather than
answering it.

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

**Threat model boundary — resolved by M22 (2026-09-01).** This paragraph originally recorded a gap
and warned every downstream document not to overstate it (a warning that was not heeded — see the
2026-08-31 decision-log entry below). At the time, keypair generation and every decrypt
(`share_medical_notes`, leader read) took the plaintext password in a request to the backend, so a
compromised or malicious *live* server could capture it and decrypt — the standard "encrypted at
rest, password-wrapped key" pattern, not Signal/WhatsApp-style E2E. M22 moved all of that
client-side: `frontend/lib/crypto/medical.ts` derives the key and does every encrypt/decrypt in the
browser (falling back to React Native for M9), and the backend endpoints now accept and return only
ciphertext — no medical-notes endpoint accepts a password. **The claim is now true**: the server
never sees a plaintext password or a plaintext private key for this feature, only opaque
ciphertext, so a compromised live server can no longer capture the key in transit. What is
unchanged, and remains the honest boundary: the server *did* decrypt on every past operation before
M22, so ciphertext written before this milestone offers no retroactive guarantee about who saw it
in the clear at the time; and the leader's own client still holds the unwrapped key in memory while
reading crew notes, which a compromised *client* (not server) can still exfiltrate — no design
changes that.

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

Users registered before this feature deployed have `public_key = NULL`. Existing `TripMember.medical_notes` plaintext rows are nulled in the migration.

Such an account is repaired **silently at sign-in** (2026-09-23): `POST /auth/login` returns `has_keypair`, and on an explicit `false` the login action hands control back to the form instead of redirecting, so the browser can derive a keypair from the password it is still holding and `POST /me/keypair` before navigating. Sign-in is the only moment this is possible — the private half must be wrapped under a password-derived key, and since M22 that derivation happens only in the browser. It is best-effort: the user is already authenticated when it runs, so a failure navigates anyway and retries at the next sign-in, and it says nothing on screen, because naming encryption would advertise a feature that is currently parked. This **replaces** the original plan of prompting via `KeypairPromptBanner`, which cannot serve while `NEXT_PUBLIC_MEDICAL_NOTES` is off — see the 2026-09-23 decision-log row.

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
- **Trip-invite email/username lookup oracle — closed (M12 §N).** `POST /api/trip/<id>/invite`
  previously accepted `{"email": ...}` or `{"username": ...}` and distinguished "no account"
  (404) from "already a member/invited" (409) from success (201) — a leader-facing oracle
  letting any trip leader test arbitrary email addresses or usernames for account existence.
  Closed by removing both lookup paths from the endpoint entirely (only `{"userId": ...}` is
  now accepted, sourced from the buddy picker or paddler search — a value the leader can only
  obtain from context they can already see, never a blind guess). Frontend `InviteForm` (email
  entry) was removed in the same change — removing only the frontend form while leaving the
  backend branch reachable would not have closed the oracle, only hidden the UI for exploiting
  it. **Accepted cost:** a leader can no longer invite someone who isn't yet a buddy connection
  by email; the buddy-picker-only flow means connect-then-invite for anyone not already a
  buddy (consistent with M7b's connection-gated invite model). A "Can't find them? Find
  paddlers →" link from the buddy picker covers the connect-first step.

---

## Email-change flow (M12 §J)

Email is the login identifier, so a change is treated with the same care as a password reset —
structurally mirrored on the existing token/re-auth machinery rather than inventing a new pattern:

- **Two-step: request (authenticated + elevated) → verify (anonymous, token-only).**
  `POST /api/v1/user/me/email-change` requires both a normal session and a fresh elevated token
  (`JWTService.require_elevated_token`, the same re-auth gate as medical notes/certifications) —
  changing the account's identity needs a just-proven password, not just an active session.
  `GET /api/v1/auth/verify-email-change?token=...` is anonymous, mirroring `/auth/verify`'s shape
  exactly (single-token action, no other body field) — this endpoint is what completes the change
  when the link is clicked, possibly from a different device/session than the one that requested it.
- **`pending_mail` on `User`, not an `AuthToken` payload.** `AuthToken` stays a generic, minimal
  single-use-token model shared by four other token types; state that must outlive one token
  (the address awaiting confirmation) gets a dedicated column, matching the existing
  `deletion_requested_at`/`medical_notes_reset_at` precedent. This also lets the frontend render a
  durable "pending — check your inbox" state across reloads with no client-side state machine.
- **Enumeration-safe.** Requesting a change to an address already taken by someone else is a
  silent no-op (202, no email sent, no error) — mirrors `AuthService.register_user`'s existing-user
  handling. Requesting the caller's own current address is a visible 400 (not an enumeration risk —
  it concerns only the caller's own data).
- **`token_version` bump on verify, not on request.** The identity swap only takes effect once the
  new address is proven reachable (link clicked); bumping revocation at request time would log the
  user out for a change they haven't confirmed yet. On verify, `token_version` increments exactly
  like a password reset — every outstanding session on the old identity ends, forcing re-login.
- **Old address gets a notice, not a link.** After the swap, the *old* mailbox receives an
  informational "your email was changed" email (mirrors `medical_notes_cleared`'s "something
  changed on your account" precedent) with no action of its own — the actionable path if it wasn't
  the account owner is "reset your password," already covered by the existing forgot-password flow.

## Decision log

| Decision | Original ADR | Date | Notes |
|----------|-------------|------|-------|
| Float plan as computed view | ADR-018 | 2026-05-09 | No `FloatPlan` table; copy-on-join + consent-to-share model |
| Float plan sharing — frozen snapshot | ADR-022 | 2026-05-16 | Supersedes ADR-018 §"Float plan delivery"; medical notes excluded from snapshot |
| Medical notes ECIES encryption | ADR-023 | 2026-05-16 | Amends ADR-018 §"Medical notes — copy-on-join, consent-to-share"; plaintext column dropped |
| Password-reset medical-notes data loss — notify + re-entry prompt | — | 2026-06-16 | Reset clears unreadable ciphertext; `medical_notes_reset_at` flag + `medical_notes_cleared` email + in-app prompt; rejected re-entry during the reset flow (would hold plaintext unauthenticated). Closes 2026-06-11 security review Step 4. |
| Enumeration/oracle hardening (M7a §4) | — | 2026-06-25 | Closed login-timing, `deletion_pending`-before-password, registration, and GPX-XXE oracles; **consciously declined** the 403→404 `require_owner` flip (non-enumerable UUIDv7 + auth gating make the oracle non-exploitable; 403 is more correct for shared resources). Closes the 2026-06-11 review's deferred LOW items. |
| Email-change flow (M12 §J) | — | 2026-07-13 | Request (elevated-token-gated) → verify (anonymous, token-only, mirrors `/auth/verify`) two-step; new `pending_mail` column on `User` (not an `AuthToken` payload field); enumeration-safe (silent no-op for a taken address); `token_version` bumped on verify, not request; old address gets a non-actionable notice email. |
| Trip-invite email/username oracle (M12 §N) | — | 2026-07-13 | Removed the `email`/`username` invite-lookup branches from `POST /trip/<id>/invite` (frontend `InviteForm` removed in the same change) — buddy-picker `userId` invite is now the sole path; accepted cost is invite-a-non-buddy becomes connect-then-invite. |
| **"E2E encryption" corrected in every downstream doc** | — | 2026-08-31 | This document's threat-model paragraph has always been precise — password-wrapped key at rest, *not* zero-knowledge, with the explicit warning to *"be precise about this distinction anywhere this feature is described as 'E2E encryption' (e.g. the root conventions doc milestone table)"*. That is exactly where it drifted, and further: the root conventions doc's M3g row read "Medical notes E2E encryption"; `docs/play-store-checklist.md` §3b argued for a softer Play health-data declaration on the grounds the feature is *"genuinely client-side E2E encrypted … the server stores only ciphertext it cannot read"*; the live **Terms of Use** told users their notes were *"end-to-end encrypted and only ever decryptable by your trip leader"* — false twice over, since the server sees plaintext and password on every operation, and the owner can decrypt too. **Even this file's own frontmatter abstract said "ECIES E2E encryption"**, contradicting its body. Caught while writing the privacy policy, which would otherwise have shipped the same false claim to users and to Play. All corrected; the Terms section now defers to the privacy policy rather than restating crypto. **The design is unchanged and remains sound** — a stolen database or backup is unreadable, which is the threat it was built for. The Play consequence is concrete: Health info is declared as collected, plainly, because the E2E carve-out does not apply. Pattern worth naming, the fourth instance in one day: a caveat recorded in one document does not reach the places that describe the same thing, even when the caveat names those places |
| **M22 made the E2E claim true** | — | 2026-09-01 | The 2026-08-31 entry above corrected every doc to admit the design was *not* E2E; this entry is the fix to the design itself, closing that gap for good rather than continuing to caveat it. `frontend/lib/crypto/medical.ts` reimplements `Services/crypto_service.py` byte-for-byte and every medical-notes operation (registration keypair, save/read own notes, share-with-leader, leader read, password-change rewrap) moved client-side; no endpoint accepts a password for any of it. No migration was needed — the wrapped-key format didn't change, so client-side code reads every ciphertext the old server-side code produced, verified against a pre-M22 account's real row. WP4 (password-change rewrap) closed 2026-09-01: `PATCH /me/password` now takes an optional rewrapped-key triple instead of doing the unwrap/rewrap itself, and rejects the request (400) if the account has a keypair and the triple is missing, so a keypair can never be silently orphaned by a password change. |
| **Medical notes parked** | — | 2026-09-02 | The feature is built, tested and **not offered**. Two flags (`MEDICAL_NOTES_ENABLED`, `NEXT_PUBLIC_MEDICAL_NOTES`), off by default everywhere, plus migration `e7a2c40d9b13` purging stored notes/consent/access-log while keeping keypairs. Reasoning: Art. 9 special-category data, a Play Data-safety declaration and a privacy-policy section, all carried for a convenience nothing else depends on, on an app not yet in alpha — and the cost of parking only grows with every tester who stores something. **Not a reversal of M22**; that work is what made the parked state cheap to hold, since the server holds no plaintext to worry about either way. The privacy policy's health-data section was **removed**, not marked unavailable, and §2 now states the Service does not collect health data — describing processing the app does not perform is a liability. Side effects: M9's medical-notes-on-device question is moot for now (sidestepped, not answered) and Health info leaves the Play declaration; both reopen on unparking. See "Parked (2026-09-02)" above for the full shape. |
| **Keypairs rebuilt silently at sign-in** | — | 2026-09-23 | Found by inspecting the live database: accounts that had reset their password held no `public_key`, `private_key_ciphertext`, `private_key_nonce` or `private_key_salt`. That part is by design (see "Password reset — unavoidable data loss"), but nothing rebuilt them. The stated reason for generating a keypair at every registration — that unparking stays one environment variable rather than a re-key prompt for every account — was therefore being **eroded one reset at a time**, since the only route back, `KeypairPromptBanner`, returns `null` while `NEXT_PUBLIC_MEDICAL_NOTES` is off. The cost was still being paid at signup (~0.4s PBKDF2) while the invariant it bought no longer held. Fixed at sign-in rather than by ungating the banner: it is the only moment the browser holds the password the private half must be wrapped under, and it needs no UI, so a parked feature is not advertised to reach it. `POST /auth/login` gained `has_keypair` (free — the user row is already loaded to verify the password), and only an explicit `false` diverts the flow, so a response without the field behaves exactly as before. Best-effort by construction: authentication has already succeeded when it runs, the navigation sits in a `finally`, and the rejection is swallowed rather than merely survived. Three options were weighed — this, stopping keypair generation at registration entirely, and leaving it with a note on the unparking checklist; the first is the only one that makes the registration cost honest. Also worth noting for the next reader: `password_changed_at` and `token_version` are stamped by **both** the reset and change paths, so neither column distinguishes them — `public_key IS NULL` is what identifies a reset, since a change rewraps and never clears it. |
