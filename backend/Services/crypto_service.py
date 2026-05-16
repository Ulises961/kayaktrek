import base64
import os

from cryptography.hazmat.primitives.asymmetric.x25519 import X25519PrivateKey, X25519PublicKey
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes, serialization


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


_ECIES_INFO = b"float-plan-medical"


def generate_keypair(password: str) -> tuple[str, str, str, str]:
    """
    Generate a random X25519 keypair and encrypt the private key with password.

    Returns (public_key_b64, private_key_ciphertext_b64, private_key_nonce_b64, private_key_salt_b64).
    The public key is safe to store in plaintext. The private key triple requires the password to decrypt.
    """
    private_key = X25519PrivateKey.generate()
    private_key_bytes = private_key.private_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PrivateFormat.Raw,
        encryption_algorithm=serialization.NoEncryption(),
    )
    public_key_bytes = private_key.public_key().public_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PublicFormat.Raw,
    )
    public_key_b64 = base64.b64encode(public_key_bytes).decode()
    private_key_b64 = base64.b64encode(private_key_bytes).decode()
    ciphertext, nonce, salt = encrypt(private_key_b64, password)
    return public_key_b64, ciphertext, nonce, salt


def encrypt_for_recipient(plaintext: str, recipient_public_key_b64: str) -> tuple[str, str, str]:
    """
    ECIES-encrypt plaintext for a recipient identified by their X25519 public key.

    Returns (ciphertext_b64, nonce_b64, ephemeral_public_key_b64).
    Store all three alongside each other; the ephemeral public key is required for decryption.
    """
    recipient_public_key = X25519PublicKey.from_public_bytes(
        base64.b64decode(recipient_public_key_b64)
    )
    ephemeral_private = X25519PrivateKey.generate()
    shared_secret = ephemeral_private.exchange(recipient_public_key)
    symmetric_key = HKDF(
        algorithm=hashes.SHA256(),
        length=32,
        salt=None,
        info=_ECIES_INFO,
    ).derive(shared_secret)
    nonce = os.urandom(12)
    ciphertext = AESGCM(symmetric_key).encrypt(nonce, plaintext.encode(), None)
    ephemeral_public_key_bytes = ephemeral_private.public_key().public_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PublicFormat.Raw,
    )
    return (
        base64.b64encode(ciphertext).decode(),
        base64.b64encode(nonce).decode(),
        base64.b64encode(ephemeral_public_key_bytes).decode(),
    )


def decrypt_as_recipient(
    ciphertext_b64: str,
    nonce_b64: str,
    ephemeral_public_key_b64: str,
    private_key_ciphertext_b64: str,
    private_key_nonce_b64: str,
    private_key_salt_b64: str,
    password: str,
) -> str:
    """
    ECIES-decrypt ciphertext using the recipient's password-protected private key.

    Raises cryptography.exceptions.InvalidTag if the password is wrong or ciphertext is tampered.
    """
    private_key_b64 = decrypt(
        private_key_ciphertext_b64, private_key_nonce_b64, private_key_salt_b64, password
    )
    private_key = X25519PrivateKey.from_private_bytes(base64.b64decode(private_key_b64))
    ephemeral_public_key = X25519PublicKey.from_public_bytes(
        base64.b64decode(ephemeral_public_key_b64)
    )
    shared_secret = private_key.exchange(ephemeral_public_key)
    symmetric_key = HKDF(
        algorithm=hashes.SHA256(),
        length=32,
        salt=None,
        info=_ECIES_INFO,
    ).derive(shared_secret)
    plaintext = AESGCM(symmetric_key).decrypt(
        base64.b64decode(nonce_b64),
        base64.b64decode(ciphertext_b64),
        None,
    )
    return plaintext.decode()
