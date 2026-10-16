import base64
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from flask import current_app

# Unattended, server-decryptable at-rest encryption for secrets the app must read
# without a user present (satellite feed passwords, decrypted on every Celery beat
# poll). This is the opposite requirement from Services/crypto_service.py, whose two
# schemes are deliberately E2E — the server *cannot* decrypt without a user-held
# password. Here the server is the only party that ever decrypts, so the key is a
# plain application secret, not user-derived (satellite-feed-spec.md §2.6).
#
# Read via current_app.config, not a module-level constant: every caller (the
# Resources layer and Tasks/satellite_feed_beat_task.py's ContextTask) always runs
# inside a Flask app context, so this picks up TestingConfig's safe test default
# (Api/config.py) without sniffing CONFIG_MODE directly — that env var reflects
# whatever a contributor's own .env sets it to, not what createApp() was actually
# built with. Falls back to a bare env read for the rare caller with no app context
# (e.g. a standalone script).


def _key() -> bytes:
    try:
        key_hex = current_app.config.get("FEED_CREDENTIAL_KEY")
    except RuntimeError:
        key_hex = None
    if not key_hex:
        key_hex = os.getenv("FEED_CREDENTIAL_KEY")
    if not key_hex:
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
