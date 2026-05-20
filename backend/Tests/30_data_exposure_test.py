"""
Sensitive data exposure audit — S8.

Verifies that no API response leaks fields that must never leave the server:
password hashes, encrypted blobs, private key material, internal timestamps
used for token revocation, and raw database error messages.

§1  User profile endpoints
      GET /api/user/me and GET /api/user/<id> must not return:
        - pwd (bcrypt hash)
        - medical_notes_ciphertext / _nonce / _salt (encrypted at rest)
        - private_key_ciphertext / _nonce / _salt (X25519 private key, password-encrypted)
        - password_changed_at (internal token-revocation timestamp)
      They MAY return medical_notes_consent_at (consent flag for UI) and
      deletion_requested_at (user's own account status).

§2  Error response hygiene
      Database errors must not echo raw SQL, constraint names, or table/column
      names back to the client. Tested by triggering a duplicate-key IntegrityError
      and asserting the response body is safe.

§3  Auth token confidentiality
      Password-reset and email-verification tokens are single-use secrets.
      They must appear only in the emailed link, never in any API response body.
      The forgot-password and register endpoints are tested here.
"""
import json
import re

import pytest

from Resources.user_resource import USER_ENDPOINT

_SENSITIVE_FIELDS = {
    "pwd",
    "medical_notes_ciphertext",
    "medicalNotesCiphertext",
    "medical_notes_nonce",
    "medicalNotesNonce",
    "medical_notes_salt",
    "medicalNotesSalt",
    "private_key_ciphertext",
    "privateKeyCiphertext",
    "private_key_nonce",
    "privateKeyNonce",
    "private_key_salt",
    "privateKeySalt",
    "password_changed_at",
    "passwordChangedAt",
}

# These patterns match raw PostgreSQL/psycopg error text, not friendly messages.
# "constraint" alone is fine in "Database constraint violation"; "constraint \"" is not.
_SQL_PATTERNS = [
    r'constraint "',       # PostgreSQL error: violates unique constraint "users_mail_key"
    r'column "',           # PostgreSQL error: column "pwd" of relation ...
    r'relation "',         # PostgreSQL error: relation "users" already exists
    r'table "',            # SQLAlchemy table repr
    r"\bpg_",              # PostgreSQL catalog functions/types
    r"\bpsycopg\b",        # psycopg driver name
    r"\[SQL:",             # SQLAlchemy raw SQL dump in error messages
    r"Background on this error",  # SQLAlchemy error link
]


def _assert_no_sensitive(data: dict, label: str = "") -> None:
    for key in _SENSITIVE_FIELDS:
        assert key not in data, f"[{label}] sensitive field '{key}' present in response"


# ---------------------------------------------------------------------------
# §1 — User profile endpoints
# ---------------------------------------------------------------------------

def test_get_me_no_sensitive_fields(client, auth_headers):
    """GET /api/user/me must not return any password, ciphertext, or key material."""
    r = client.get(f"{USER_ENDPOINT}/me", headers=auth_headers)
    assert r.status_code == 200
    data = json.loads(r.data)
    _assert_no_sensitive(data, "GET /api/user/me")


def test_get_user_by_id_no_sensitive_fields(client, auth_headers, id):
    """GET /api/user/<id> (self) must not return sensitive fields."""
    r = client.get(f"{USER_ENDPOINT}/{id}", headers=auth_headers)
    assert r.status_code == 200
    data = json.loads(r.data)
    _assert_no_sensitive(data, "GET /api/user/<id>")


def test_search_users_no_sensitive_fields(client, auth_headers, user_2):
    """GET /api/user/search returns only a projected subset — verify no sensitive fields."""
    r = client.get(f"{USER_ENDPOINT}/search?q={user_2.mail[:6]}", headers=auth_headers)
    assert r.status_code == 200
    results = json.loads(r.data)
    for user_data in results:
        _assert_no_sensitive(user_data, "search result")


# ---------------------------------------------------------------------------
# §2 — Error response hygiene
# ---------------------------------------------------------------------------

def test_duplicate_registration_no_sql_leak(client):
    """
    Registering with an already-taken email triggers an IntegrityError.
    The response must not include raw SQL text, constraint names, or table names.
    """
    payload = {
        "mail": "sql.leak.test@example.com",
        "pwd": "Password9$",
        "phone": "+39099900099",
        "name": "SqlLeak",
        "username": "sql_leak_test",
    }
    client.post("/api/auth/register", json=payload)

    r = client.post("/api/auth/register", json=payload)
    body = r.data.decode()

    assert r.status_code in (400, 409, 422), f"unexpected status {r.status_code}"
    assert "detail" not in json.loads(body), "raw SQL detail field must not be present"

    for pattern in _SQL_PATTERNS:
        assert not re.search(pattern, body, re.IGNORECASE), (
            f"SQL pattern {pattern!r} found in error response: {body[:200]}"
        )


def test_duplicate_username_no_sql_leak(client):
    """Same check for duplicate username constraint."""
    base = {
        "mail": "sqlleak.a@example.com",
        "pwd": "Password9$",
        "phone": "+39099900098",
        "name": "SqlA",
        "username": "sql_dup_user",
    }
    client.post("/api/auth/register", json=base)

    payload2 = {**base, "mail": "sqlleak.b@example.com", "phone": "+39099900097"}
    r = client.post("/api/auth/register", json=payload2)
    body = r.data.decode()

    assert r.status_code in (400, 409, 422)
    assert "detail" not in json.loads(body)
    for pattern in _SQL_PATTERNS:
        assert not re.search(pattern, body, re.IGNORECASE), (
            f"SQL pattern {pattern!r} found in error response: {body[:200]}"
        )


# ---------------------------------------------------------------------------
# §3 — Auth token confidentiality
# ---------------------------------------------------------------------------

def test_forgot_password_does_not_return_token(client):
    """
    POST /api/auth/forgot-password must return a generic 200 without any token
    in the response body. The actual reset token is delivered by email only.
    """
    r = client.post("/api/auth/forgot-password", json={"mail": "nobody@example.com"})
    assert r.status_code == 200
    body = json.loads(r.data)
    body_str = json.dumps(body)
    assert "token" not in body_str.lower() or list(body.keys()) == ["status", "message"], (
        f"Response may contain a token field: {body}"
    )


def test_register_does_not_return_verification_token(client):
    """
    POST /api/auth/register must not include the email-verification token in
    the response — it is delivered by email only.
    """
    import uuid
    s = uuid.uuid4().hex[:8]
    numeric = str(int(s, 16) % 100_000_000).zfill(8)
    r = client.post("/api/auth/register", json={
        "mail": f"notoken_{s}@example.com",
        "pwd": "Password9$",
        "phone": f"+390{numeric}",
        "name": "NoToken",
        "username": f"notoken_{s}",
    })
    assert r.status_code == 201
    body = json.loads(r.data)
    assert "token" not in body, f"verification token exposed in register response: {body}"
    assert "verificationToken" not in body
    assert "verification_token" not in body
