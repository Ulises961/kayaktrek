import base64
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

# Unattended, server-decryptable at-rest encryption for secrets the app must read
# without a user present (satellite feed passwords, decrypted on every Celery beat
# poll). This is the opposite requirement from Services/crypto_service.py, whose two
# schemes are deliberately E2E — the server *cannot* decrypt without a user-held
# password. Here the server is the only party that ever decrypts, so the key is a
# plain application secret, not user-derived (satellite-feed-spec.md §2.6).
#
# Read per call, not cached at import: matches the CHECKPOINT_ALERT_HOURS pattern in
# Tasks/checkpoint_beat_task.py — a module-level read fixes the value when the worker
# process starts, so rotating the key would need a worker restart either way, but a
# per-call read at least keeps this module import-safe before the env is configured
# (e.g. at Alembic/CLI import time).


_TEST_DEFAULT_KEY_HEX = "00" * 32


def _key() -> bytes:
    key_hex = os.getenv("FEED_CREDENTIAL_KEY")
    if not key_hex:
        # Same fallback shape as TestingConfig.SECRET_KEY in Api/config.py — required
        # everywhere else, but the test suite shouldn't need every contributor to add
        # a real secret to their local .env just to exercise M29.
        if os.getenv("CONFIG_MODE") == "testing":
            key_hex = _TEST_DEFAULT_KEY_HEX
        else:
            raise KeyError("FEED_CREDENTIAL_KEY")
    key = bytes.fromhex(key_hex)
    if len(key) != 32:
        raise ValueError("FEED_CREDENTIAL_KEY must be 32 bytes (64 hex chars)")
    return key


def encrypt(plaintext: str) -> tuple[str, str]:
    """Encrypt plaintext with the server's application key.

    Returns (ciphertext_b64, nonce_b64). Both are safe to store; only
    FEED_CREDENTIAL_KEY must stay secret.
    """
    nonce = os.urandom(12)
    ct = AESGCM(_key()).encrypt(nonce, plaintext.encode(), None)
    return base64.b64encode(ct).decode(), base64.b64encode(nonce).decode()


def decrypt(ciphertext_b64: str, nonce_b64: str) -> str:
    """Decrypt ciphertext encrypted by `encrypt` above.

    Raises cryptography.exceptions.InvalidTag if FEED_CREDENTIAL_KEY is wrong or the
    ciphertext has been tampered with.
    """
    plaintext = AESGCM(_key()).decrypt(
        base64.b64decode(nonce_b64),
        base64.b64decode(ciphertext_b64),
        None,
    )
    return plaintext.decode()
