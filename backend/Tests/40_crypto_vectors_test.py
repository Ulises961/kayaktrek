"""
Lock `Services/crypto_service.py` to the cross-language test vectors (M22).

This suite is not about whether the crypto is *correct* — `cryptography` answers that. It is
about whether the crypto is **the same as it was yesterday**, because every ciphertext already
in the database was produced by these exact parameters.

Change the iteration count, the HKDF `info` string, the key length, or the text encoding, and
nothing fails at import, nothing fails at runtime, and every existing medical note silently
becomes unreadable. Nobody notices until someone needs one, which by design is during an
emergency. These tests are the tripwire, and they are the same fixture the TypeScript client
asserts against, so the two implementations cannot drift apart either.

If a test here fails, fix the code. Do not regenerate the fixture — that converts the alarm
into a rubber stamp.
"""

import base64
import json
from pathlib import Path

import pytest
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric.x25519 import X25519PrivateKey
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

from Services.crypto_service import (
    _ECIES_INFO,
    _derive_key,
    decrypt,
    decrypt_as_recipient,
    encrypt,
    encrypt_for_recipient,
    generate_keypair,
)

_VECTORS = json.loads(
    (Path(__file__).parent / "fixtures" / "medical_crypto_vectors.json").read_text()
)


def _b64d(value: str) -> bytes:
    return base64.b64decode(value)


@pytest.mark.parametrize("case", _VECTORS["symmetric"], ids=lambda c: repr(c["plaintext"])[:32])
def test_derived_key_matches_vector(case):
    """PBKDF2 output is pinned. A changed iteration count orphans every stored ciphertext."""
    derived = _derive_key(case["password"], _b64d(case["salt"]))
    assert base64.b64encode(derived).decode() == case["derived_key"]


@pytest.mark.parametrize("case", _VECTORS["symmetric"], ids=lambda c: repr(c["plaintext"])[:32])
def test_aes_gcm_ciphertext_matches_vector(case):
    """Same key, salt and nonce must produce byte-identical ciphertext."""
    key = _derive_key(case["password"], _b64d(case["salt"]))
    produced = AESGCM(key).encrypt(_b64d(case["nonce"]), case["plaintext"].encode(), None)
    assert base64.b64encode(produced).decode() == case["ciphertext"]


@pytest.mark.parametrize("case", _VECTORS["symmetric"], ids=lambda c: repr(c["plaintext"])[:32])
def test_decrypt_reads_the_vector_ciphertext(case):
    """
    The direction that actually matters for existing data: the shipped `decrypt` must read a
    ciphertext it did not produce in this process.
    """
    assert decrypt(case["ciphertext"], case["nonce"], case["salt"], case["password"]) == case[
        "plaintext"
    ]


def test_decrypt_rejects_a_wrong_password():
    case = _VECTORS["symmetric"][0]
    with pytest.raises(Exception):
        decrypt(case["ciphertext"], case["nonce"], case["salt"], "not the password")


def test_encrypt_round_trips_with_fresh_randomness():
    """`encrypt` picks its own salt and nonce, so assert the round trip rather than the bytes."""
    ciphertext, nonce, salt = encrypt("Nut allergy — EpiPen in PFD", "hunter2")
    assert decrypt(ciphertext, nonce, salt, "hunter2") == "Nut allergy — EpiPen in PFD"


def test_ecies_parameters_match_vector():
    """
    The HKDF `info` string is load-bearing and easy to typo. It is not derived from anything,
    so a changed value produces a different key with no error anywhere.
    """
    vector = _VECTORS["ecies_vector"]
    assert _ECIES_INFO.decode() == _VECTORS["ecies"]["hkdf_info"]

    recipient = X25519PrivateKey.from_private_bytes(_b64d(vector["recipient_private_key"]))
    ephemeral = X25519PrivateKey.from_private_bytes(_b64d(vector["ephemeral_private_key"]))
    shared = ephemeral.exchange(recipient.public_key())
    derived = HKDF(algorithm=hashes.SHA256(), length=32, salt=None, info=_ECIES_INFO).derive(shared)
    assert base64.b64encode(derived).decode() == vector["derived_key"]

    produced = AESGCM(derived).encrypt(_b64d(vector["nonce"]), vector["plaintext"].encode(), None)
    assert base64.b64encode(produced).decode() == vector["ciphertext"]


def test_public_key_derivation_matches_vector():
    """A private key must yield the public key the fixture pairs it with."""
    vector = _VECTORS["ecies_vector"]
    recipient = X25519PrivateKey.from_private_bytes(_b64d(vector["recipient_private_key"]))
    public_bytes = recipient.public_key().public_bytes(
        encoding=serialization.Encoding.Raw, format=serialization.PublicFormat.Raw
    )
    assert base64.b64encode(public_bytes).decode() == vector["recipient_public_key"]


def _wrap_recipient_key(password: str) -> tuple[str, str, str]:
    """
    `decrypt_as_recipient` takes the recipient's private key as the stored *wrapped* triple
    plus a password, not as raw bytes — it unwraps before it decrypts. So the fixture's raw
    key has to be put back into that form to exercise the real call path.
    """
    vector = _VECTORS["ecies_vector"]
    return encrypt(vector["recipient_private_key"], password)


def test_decrypt_as_recipient_reads_the_vector_ciphertext():
    """
    End to end against data this process did not create — the leader-read path, which is the
    one that runs when someone is hurt.
    """
    vector = _VECTORS["ecies_vector"]
    key_ciphertext, key_nonce, key_salt = _wrap_recipient_key("hunter2")

    recovered = decrypt_as_recipient(
        vector["ciphertext"],
        vector["nonce"],
        vector["ephemeral_public_key"],
        key_ciphertext,
        key_nonce,
        key_salt,
        "hunter2",
    )
    assert recovered == vector["plaintext"]


def test_encrypt_for_recipient_round_trips():
    vector = _VECTORS["ecies_vector"]
    key_ciphertext, key_nonce, key_salt = _wrap_recipient_key("hunter2")

    ciphertext, nonce, ephemeral_public = encrypt_for_recipient(
        "Epileptic — see crew brief", vector["recipient_public_key"]
    )
    assert (
        decrypt_as_recipient(
            ciphertext, nonce, ephemeral_public, key_ciphertext, key_nonce, key_salt, "hunter2"
        )
        == "Epileptic — see crew brief"
    )


def test_generated_keypair_unwraps_with_its_password():
    """
    Ties the two halves together: a keypair generated now must be unwrappable by the same
    password-derived key path the vectors pin.
    """
    public_key, private_ciphertext, private_nonce, private_salt = generate_keypair("hunter2")
    unwrapped = decrypt(private_ciphertext, private_nonce, private_salt, "hunter2")

    private_key = X25519PrivateKey.from_private_bytes(base64.b64decode(unwrapped))
    derived_public = private_key.public_key().public_bytes(
        encoding=serialization.Encoding.Raw, format=serialization.PublicFormat.Raw
    )
    assert base64.b64encode(derived_public).decode() == public_key
