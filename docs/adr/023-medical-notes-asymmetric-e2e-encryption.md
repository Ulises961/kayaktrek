# ADR-023: Medical notes — asymmetric end-to-end encryption for leader-visible copy

**Status**: accepted  
**Date**: 2026-05-16  
**Amends**: ADR-018 §"Medical notes — copy-on-join, consent-to-share"

## Context

ADR-018 established a consent-to-share model where `TripMember.medical_notes` holds a
leader-visible plaintext copy written by the `share_medical_notes` service method. The
encrypted private copy (`medical_notes_ciphertext/nonce/salt`) was correctly protected by
the member's password-derived key. The leader-visible copy was not.

`User.medical_notes` demonstrates the correct pattern: notes are always in
`medical_notes_ciphertext/nonce/salt`, decrypted on-demand in memory, never persisted as
plaintext. The `TripMember` model deviated from this — `medical_notes` (plaintext column)
exists as a regression from the established pattern. This column exposes consented medical
notes to any actor with database read access (DB admin, backup leak, SQL injection).

The fix: replace the plaintext column with an ECIES-encrypted leader copy. The cryptography
library already installed (`cryptography`) supports X25519 and HKDF. No new dependency.

## Decision

### Keypair model

Each `User` gets an X25519 keypair generated at registration.

**Private key storage** — random keypair, private key encrypted at rest:
- Generate random `X25519PrivateKey` (32 bytes).
- Encrypt the raw private key bytes with AES-GCM using a PBKDF2-derived key from the user's
  password (same pattern as `crypto_service.encrypt`).
- Store: `User.private_key_ciphertext`, `User.private_key_nonce`, `User.private_key_salt`.
- On password change: re-encrypt only the 32-byte private key blob. The keypair itself does
  not change. No downstream re-encryption required.

**Public key storage**:
- Store the X25519 public key bytes base64-encoded in `User.public_key`.
- Public by definition — no access control required.

Generating a random keypair (rather than deriving it deterministically from the password)
decouples key rotation from password changes. A password change is a re-encryption of 32
bytes, not a re-encryption of every TripMember ciphertext.

### ECIES encryption (member → leader)

When the member calls `share_medical_notes`, the backend:

1. Decrypts the member's private copy (`medical_notes_ciphertext`) with their password.
2. Fetches the leader's `public_key` from `User`.
3. Generates an ephemeral `X25519PrivateKey`.
4. Computes shared secret: `shared = ephemeral_private.exchange(leader_public_key)`.
5. Derives a 32-byte symmetric key: `HKDF(shared, salt=b"float-plan-medical", hash=SHA256)`.
6. Encrypts plaintext: `AESGCM(derived_key).encrypt(nonce, plaintext, None)`.
7. Stores on `TripMember`:
   - `medical_notes_leader_ciphertext` — AES-GCM ciphertext (base64)
   - `medical_notes_leader_nonce` — AES-GCM nonce (base64)
   - `medical_notes_leader_ephemeral_key` — ephemeral public key bytes (base64, 32 bytes → 44 chars)
8. Plaintext is never written to the database.

### ECIES decryption (leader reads)

Leader calls `POST /api/trip/<id>/member/<member_id>/medical-notes` with their password:

1. Backend fetches leader's `private_key_ciphertext/nonce/salt`, decrypts with their password
   → raw private key bytes → `X25519PrivateKey`.
2. Reconstructs ephemeral public key from stored `medical_notes_leader_ephemeral_key`.
3. Computes shared secret: `shared = leader_private.exchange(ephemeral_public_key)`.
4. Re-derives symmetric key (same HKDF parameters).
5. Decrypts ciphertext in memory → returns plaintext in the response body.
6. Plaintext never written to DB.

The `medical_notes` column (plaintext) is dropped entirely.

### Schema changes

**`User` — new columns**:

| Column | Type | Notes |
|--------|------|-------|
| `public_key` | `Text NULL` | Base64 X25519 public key (44 chars). NULL until keypair generated. |
| `private_key_ciphertext` | `Text NULL` | AES-GCM encrypted raw private key bytes |
| `private_key_nonce` | `String(32) NULL` | |
| `private_key_salt` | `String(32) NULL` | PBKDF2 salt for private key decryption |

**`TripMember` — changes**:

| Change | Column | Notes |
|--------|--------|-------|
| DROP | `medical_notes` | Plaintext — removed |
| ADD | `medical_notes_leader_ciphertext` | `Text NULL` |
| ADD | `medical_notes_leader_nonce` | `String(32) NULL` |
| ADD | `medical_notes_leader_ephemeral_key` | `String(64) NULL` — base64 X25519 ephemeral public key |

**`TripMemberSchema`**:
- Remove `medical_notes` field.
- Add `has_leader_medical_notes = fields.Method(...)` — boolean, true if
  `medical_notes_leader_ciphertext IS NOT NULL`. The leader knows notes exist but cannot
  read them without providing their password through the dedicated endpoint.

### New endpoints

`POST /api/trip/<id>/member/<member_id>/medical-notes` (leader-only):
- Body: `{ "password": "..." }`
- Returns: `{ "medicalNotes": "..." }` — plaintext in response, never cached server-side
- 403 if caller is not the trip leader
- 404 if no leader ciphertext exists for this member
- 401 if password is wrong (AES-GCM `InvalidTag`)

### Keypair generation on registration

`UserService.register(...)` calls `generate_keypair(password)` at the end of account
creation. Users registered before this feature is deployed have `public_key = NULL`.

**Migration strategy for existing users**: the first time a user without a keypair logs in,
the frontend detects `hasKeypair: false` in the session payload and prompts them to generate
one (single password entry). Backend endpoint: `POST /api/user/generate-keypair` with
`{ "password": "..." }`. Any existing `TripMember.medical_notes` plaintext rows are nulled
in the migration — members must re-share after the update.

### Keypair and password change

`UserService.change_password(old_password, new_password)`:
1. Decrypts private key with `old_password`.
2. Re-encrypts with `new_password`.
3. Updates `private_key_ciphertext/nonce/salt`.
4. The public key and all downstream leader-ciphertext rows remain valid.

### `crypto_service.py` additions

```python
def generate_keypair(password: str) -> tuple[str, str, str, str]:
    """Returns (public_key_b64, private_key_ciphertext_b64, nonce_b64, salt_b64)."""

def encrypt_for_recipient(plaintext: str, recipient_public_key_b64: str) -> tuple[str, str, str]:
    """ECIES. Returns (ciphertext_b64, nonce_b64, ephemeral_public_key_b64)."""

def decrypt_as_recipient(
    ciphertext_b64: str, nonce_b64: str, ephemeral_public_key_b64: str,
    private_key_ciphertext_b64: str, private_key_nonce_b64: str, private_key_salt_b64: str,
    password: str,
) -> str:
    """ECIES. Derives private key from password, decrypts ciphertext."""
```

The existing `encrypt` / `decrypt` functions are untouched — they continue to protect the
member's own private copy and all other password-encrypted fields.

## Consequences

**Positive**
- `TripMember` plaintext column eliminated. DB breach, backup leak, or SQL injection no
  longer exposes consented medical notes.
- Password change does not cascade to re-encrypt downstream data — only the 32-byte private
  key blob is re-encrypted.
- No new dependency — `cryptography` (already installed) provides X25519, HKDF, AES-GCM.
- Pattern is consistent: medical notes are always ciphertext in the DB, plaintext only
  in-memory during the request that explicitly decrypts them.

**Negative / trade-offs**
- Leader must provide their password to read a member's medical notes. This is one extra
  step on the float plan page; appropriate for the data sensitivity.
- If a user registered before this feature deployed and has not yet generated a keypair,
  crew members cannot share notes with them as leader until they do. The prompt-on-login
  flow handles this.
- Existing `TripMember.medical_notes` rows are nulled in the migration. Members of active
  trips (dev/test data at this stage) must re-share after the update.

**Open questions / deferred**
- **Key compromise**: if a user's password is leaked, an attacker can derive their private
  key and decrypt all leader ciphertext rows. Password compromise is out of scope here —
  mitigated by bcrypt on the login path and rate limiting on auth endpoints (already in
  place).
- **Leader device compromise**: if the leader's session is hijacked and the attacker can
  call the decrypt endpoint, they get plaintext per-member on demand. Mitigated by short
  JWT expiry (15 min access tokens, already in place).
- **Ephemeral key reuse**: each `share_medical_notes` call generates a fresh ephemeral key.
  If the member updates and re-shares, a new ephemeral key is generated and the ciphertext
  is overwritten. No reuse.
