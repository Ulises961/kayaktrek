# ADR-013: GDPR erasure model — soft delete with 30-day grace period

**Status**: accepted
**Date**: 2025-03-01

## Context

GDPR Article 17 (right to erasure) requires that users can request deletion of their personal data. The challenge for a multi-user application is that a user's data is entangled with other users' data:

- A trip led by the requesting user may have other crew members whose own history depends on that trip existing.
- Logs may have been peer-endorsed by or for the requesting user.
- A hard-delete with cascade would destroy other users' data — which itself violates GDPR (data belonging to other subjects cannot be unilaterally erased).

Additionally, account deletions are sometimes requested by mistake. An irreversible immediate hard-delete is a poor user experience and creates support burden.

## Decision

Account deletion uses a **soft-delete with a 30-day grace period**, followed by a **targeted hard-delete** that removes the user's own data and anonymises only where other users' data would otherwise be lost.

### Flow

1. `DELETE /api/user/me` — sets `deletion_requested_at = now()`, sets `active = False`, revokes all tokens (immediate logout), sends a cancellation email with a one-time token.
2. During the grace period the account cannot be logged into. The login endpoint returns `403` with `code: "deletion_pending"` so the UI can surface a recovery path.
3. `DELETE /api/user/me/deletion-request` (cancellation endpoint, token-gated) — clears `deletion_requested_at`, sets `active = True`. Account fully restored.
4. A Celery beat task runs daily. Any user whose `deletion_requested_at` is older than 30 days is hard-deleted via the erasure procedure below.

### Erasure contract

The principle: **delete everything that belongs only to the user; anonymise only where deletion would destroy another user's data.**

| Data | Action |
|------|--------|
| User row | **Hard-deleted** — no ghost row retained |
| Personal profile fields (name, email, phone, avatar, vessel info, emergency contact, medical notes) | Deleted with the User row |
| Auth tokens | Revoked immediately on deletion request |
| Float plan fields on TripMember rows | Nulled before User row is deleted |
| Trips where user is sole leader **and** sole member | **Cascade-deleted** — no other user's data is affected |
| Trips where user is leader and other crew exist | Leader slot anonymised (`"Deleted member"`, contact fields nulled) before User row is deleted; trip preserved for remaining crew |
| Trips where user is crew only | TripMember row removed; trip unaffected |
| Personal logs | Deleted |
| Endorsements given/received | Endorsement links removed |
| GDPR export archives | Deleted from object storage |

### Consent cascades

Sensitive fields (`medical_notes`) require recorded consent. Revoking consent nulls the field on both the User record and every TripMember row — data cannot be retained after withdrawal (GDPR Art. 7(3)).

### Re-authentication gate

Destructive account actions (deletion request) are gated by an out-of-band email confirmation flow, not in-app password re-entry. The email account acts as the second factor for high-stakes operations. Password re-auth guards lower-stakes sensitive field access via a 5-minute elevated JWT (`POST /api/user/me/re-auth`) stored in frontend memory only — never in cookies or localStorage.

## Consequences

**Positive**
- Grace period prevents accidental permanent loss — recoverable within 30 days
- The User row is fully removed: no ghost rows accumulate in the users table
- Anonymisation is the exception, not the rule — only applied where another user's data would be lost otherwise
- Cascade-deleting solo trips is clean and complete: no orphaned records
- The cancellation email token flow is stronger than in-app password confirmation for irreversible actions
- `deletion_pending` login code gives the UI enough signal to surface a recovery path even when the user is locked out

**Negative / trade-offs**
- The 30-day grace period means personal data is retained for up to 30 days after the user requests erasure — standard practice and generally accepted under GDPR but must be disclosed in the privacy policy
- Anonymised leader slots on shared trips persist indefinitely — the trip record exists, the leader identity does not. This is the minimum retention required to preserve other users' data.
- The cancellation email is a single point of failure: if not delivered, the user is locked out with no visible recovery path. Mitigated by a resend endpoint (`POST /api/auth/resend-deletion-cancel`) accessible from the login page without authentication.

**Risks / open questions**
- **Data retention override**: national maritime law or coastguard incident reporting requirements may mandate retaining trip records beyond 30 days. Gate the hard-delete on that retention window, not just the grace period. Consult legal before launch.
- **MFA**: when MFA is introduced, `re-auth` must require a TOTP code rather than password alone.
- **Export archives**: GDPR data export files must be in a private bucket with signed URLs or a protected download endpoint — they must not be in the public-read avatar bucket (see ADR-005). Not yet implemented.
