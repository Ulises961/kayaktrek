import base64

import pytest
from cryptography.exceptions import InvalidTag

from Services.crypto_service import (
    decrypt_as_recipient,
    encrypt_for_recipient,
    generate_keypair,
)

PASSWORD = "correct-horse-battery-staple"
WRONG_PASSWORD = "wrong-password"
PLAINTEXT = "Allergic to penicillin. Takes warfarin 5mg daily."


@pytest.fixture(scope="module")
def keypair():
    public_key_b64, pk_ct, pk_nonce, pk_salt = generate_keypair(PASSWORD)
    return {
        "public_key_b64": public_key_b64,
        "pk_ct": pk_ct,
        "pk_nonce": pk_nonce,
        "pk_salt": pk_salt,
    }


@pytest.fixture(scope="module")
def encrypted(keypair):
    ct, nonce, ephemeral = encrypt_for_recipient(PLAINTEXT, keypair["public_key_b64"])
    return {"ct": ct, "nonce": nonce, "ephemeral": ephemeral}


class TestGenerateKeypair:
    def test_returns_four_non_empty_strings(self):
        result = generate_keypair(PASSWORD)
        assert len(result) == 4
        assert all(isinstance(v, str) and v for v in result)

    def test_public_key_is_32_raw_bytes(self):
        public_key_b64, *_ = generate_keypair(PASSWORD)
        assert len(base64.b64decode(public_key_b64)) == 32

    def test_each_call_produces_a_different_keypair(self):
        pub1, *_ = generate_keypair(PASSWORD)
        pub2, *_ = generate_keypair(PASSWORD)
        assert pub1 != pub2

    def test_wrong_password_cannot_decrypt_private_key(self, keypair):
        with pytest.raises(InvalidTag):
            decrypt_as_recipient(
                "dummyct", "dummynonce", "dummyephemeral",
                keypair["pk_ct"], keypair["pk_nonce"], keypair["pk_salt"],
                WRONG_PASSWORD,
            )


class TestEncryptForRecipient:
    def test_returns_three_non_empty_strings(self, keypair):
        ct, nonce, ephemeral = encrypt_for_recipient(PLAINTEXT, keypair["public_key_b64"])
        assert all(isinstance(v, str) and v for v in (ct, nonce, ephemeral))

    def test_ephemeral_key_is_32_raw_bytes(self, keypair):
        _, _, ephemeral = encrypt_for_recipient(PLAINTEXT, keypair["public_key_b64"])
        assert len(base64.b64decode(ephemeral)) == 32

    def test_each_call_produces_different_ciphertext(self, keypair):
        ct1, _, _ = encrypt_for_recipient(PLAINTEXT, keypair["public_key_b64"])
        ct2, _, _ = encrypt_for_recipient(PLAINTEXT, keypair["public_key_b64"])
        assert ct1 != ct2


class TestDecryptAsRecipient:
    def test_round_trip_returns_original_plaintext(self, keypair, encrypted):
        result = decrypt_as_recipient(
            encrypted["ct"], encrypted["nonce"], encrypted["ephemeral"],
            keypair["pk_ct"], keypair["pk_nonce"], keypair["pk_salt"],
            PASSWORD,
        )
        assert result == PLAINTEXT

    def test_wrong_password_raises_invalid_tag(self, keypair, encrypted):
        with pytest.raises(InvalidTag):
            decrypt_as_recipient(
                encrypted["ct"], encrypted["nonce"], encrypted["ephemeral"],
                keypair["pk_ct"], keypair["pk_nonce"], keypair["pk_salt"],
                WRONG_PASSWORD,
            )

    def test_tampered_ciphertext_raises_invalid_tag(self, keypair, encrypted):
        tampered = base64.b64encode(b"tampered" * 10).decode()
        with pytest.raises(InvalidTag):
            decrypt_as_recipient(
                tampered, encrypted["nonce"], encrypted["ephemeral"],
                keypair["pk_ct"], keypair["pk_nonce"], keypair["pk_salt"],
                PASSWORD,
            )

    def test_tampered_ephemeral_key_raises_invalid_tag(self, keypair, encrypted):
        wrong_pub, *_ = generate_keypair(PASSWORD)
        with pytest.raises(InvalidTag):
            decrypt_as_recipient(
                encrypted["ct"], encrypted["nonce"], wrong_pub,
                keypair["pk_ct"], keypair["pk_nonce"], keypair["pk_salt"],
                PASSWORD,
            )
