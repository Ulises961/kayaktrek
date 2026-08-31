"""
Regenerate the cross-language medical-crypto test vectors (M22).

    cd backend && uv run python Tests/fixtures/generate_vectors.py

Run this only when the scheme itself changes on purpose. Every value in the fixture is
pinned — salts, nonces, and both X25519 private keys — because a vector generated from
fresh randomness proves nothing across languages: it would agree with whatever produced
it and with nothing else.

The fixture is the contract between `Services/crypto_service.py` and the TypeScript
implementation the clients use. Both suites assert against it. Without that, the two
drift silently and the failure surfaces as health data nobody can read.

Regenerating after an accidental parameter change would paper over exactly the bug the
fixture exists to catch: if `Tests/40_crypto_vectors_test.py` fails, fix the code, do not
re-run this.
"""

import base64
import json
from pathlib import Path

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric.x25519 import X25519PrivateKey
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

from Services.crypto_service import _ECIES_INFO, _derive_key

_OUT = Path(__file__).parent / "medical_crypto_vectors.json"

# (password, salt, nonce, plaintext). Chosen to cover a plain ASCII case, a non-ASCII one
# (UTF-8 encoding must match byte for byte, and a JS implementation that uses UTF-16 code
# units here would pass ASCII and fail this), and the empty string.
_SYMMETRIC_CASES = [
    ("correct horse battery staple", b"\x00" * 16, b"\x01" * 12, "Penicillin allergy"),
    ("pässwörd wíth ünicode", bytes(range(16)), bytes(range(12)), "Asthma — blue inhaler in deck bag"),
    ("x", b"\xff" * 16, b"\x7f" * 12, ""),
]

_RECIPIENT_PRIVATE = bytes(range(32))
_EPHEMERAL_PRIVATE = bytes(range(32, 64))
_ECIES_NONCE = b"\x02" * 12
_ECIES_PLAINTEXT = "Type 1 diabetic. Glucagon in red drybag."


def _b64(raw: bytes) -> str:
    return base64.b64encode(raw).decode()


def _private_bytes(key: X25519PrivateKey) -> bytes:
    return key.private_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PrivateFormat.Raw,
        encryption_algorithm=serialization.NoEncryption(),
    )


def _public_bytes(key: X25519PrivateKey) -> bytes:
    return key.public_key().public_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PublicFormat.Raw,
    )


def build() -> dict:
    symmetric = []
    for password, salt, nonce, plaintext in _SYMMETRIC_CASES:
        key = _derive_key(password, salt)
        symmetric.append({
            "password": password,
            "salt": _b64(salt),
            "nonce": _b64(nonce),
            "plaintext": plaintext,
            "ciphertext": _b64(AESGCM(key).encrypt(nonce, plaintext.encode(), None)),
            "derived_key": _b64(key),
        })

    recipient = X25519PrivateKey.from_private_bytes(_RECIPIENT_PRIVATE)
    ephemeral = X25519PrivateKey.from_private_bytes(_EPHEMERAL_PRIVATE)
    shared_secret = ephemeral.exchange(recipient.public_key())
    symmetric_key = HKDF(
        algorithm=hashes.SHA256(), length=32, salt=None, info=_ECIES_INFO
    ).derive(shared_secret)

    return {
        "_comment": (
            "Cross-language test vectors for the medical-notes crypto scheme (M22). Generated "
            "from backend/Services/crypto_service.py, which produced every ciphertext already "
            "in the database. Both the Python and TypeScript suites assert against this file; "
            "it is the contract that stops the two implementations drifting silently, where "
            "the failure mode is unreadable health data. Regenerate with "
            "backend/Tests/fixtures/generate_vectors.py."
        ),
        "kdf": {"algorithm": "PBKDF2-HMAC-SHA256", "iterations": 600000, "key_length": 32},
        "aead": {"algorithm": "AES-GCM", "nonce_length": 12, "aad": None},
        "ecies": {
            "curve": "X25519",
            "kdf": "HKDF-SHA256",
            "hkdf_salt": None,
            "hkdf_info": _ECIES_INFO.decode(),
        },
        "symmetric": symmetric,
        "ecies_vector": {
            "recipient_private_key": _b64(_private_bytes(recipient)),
            "recipient_public_key": _b64(_public_bytes(recipient)),
            "ephemeral_private_key": _b64(_private_bytes(ephemeral)),
            "ephemeral_public_key": _b64(_public_bytes(ephemeral)),
            "nonce": _b64(_ECIES_NONCE),
            "plaintext": _ECIES_PLAINTEXT,
            "ciphertext": _b64(AESGCM(symmetric_key).encrypt(_ECIES_NONCE, _ECIES_PLAINTEXT.encode(), None)),
            "derived_key": _b64(symmetric_key),
        },
    }


if __name__ == "__main__":
    _OUT.write_text(json.dumps(build(), indent=2) + "\n")
    print(f"wrote {_OUT}")
