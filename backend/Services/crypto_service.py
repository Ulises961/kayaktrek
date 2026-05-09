import base64
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes


def _derive_key(password: str, salt: bytes) -> bytes:
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=600_000,
    )
    return kdf.derive(password.encode())


def encrypt(plaintext: str, password: str) -> tuple[str, str, str]:
    """
    Encrypt plaintext with a key derived from password.

    Returns (ciphertext_b64, nonce_b64, salt_b64).
    The nonce and salt are safe to store; only the password must stay secret.
    """
    salt = os.urandom(16)
    nonce = os.urandom(12)
    key = _derive_key(password, salt)
    ct = AESGCM(key).encrypt(nonce, plaintext.encode(), None)
    return (
        base64.b64encode(ct).decode(),
        base64.b64encode(nonce).decode(),
        base64.b64encode(salt).decode(),
    )


def decrypt(ciphertext_b64: str, nonce_b64: str, salt_b64: str, password: str) -> str:
    """
    Decrypt ciphertext using a key re-derived from password + salt.

    Raises cryptography.exceptions.InvalidTag if the password is wrong
    or the ciphertext has been tampered with.
    """
    key = _derive_key(password, base64.b64decode(salt_b64))
    plaintext = AESGCM(key).decrypt(
        base64.b64decode(nonce_b64),
        base64.b64decode(ciphertext_b64),
        None,
    )
    return plaintext.decode()
