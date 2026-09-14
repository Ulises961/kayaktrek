import os

import pytest
from cryptography.exceptions import InvalidTag

from Services.Utils import server_secret_crypto

PLAINTEXT = "hunter2"


@pytest.fixture(autouse=True)
def _feed_credential_key(monkeypatch):
    monkeypatch.setenv("FEED_CREDENTIAL_KEY", "ab" * 32)


class TestEncryptDecrypt:
    def test_round_trips(self):
        ciphertext, nonce = server_secret_crypto.encrypt(PLAINTEXT)
        assert server_secret_crypto.decrypt(ciphertext, nonce) == PLAINTEXT

    def test_ciphertext_is_not_plaintext(self):
        ciphertext, _ = server_secret_crypto.encrypt(PLAINTEXT)
        assert PLAINTEXT not in ciphertext

    def test_wrong_key_fails_to_decrypt(self, monkeypatch):
        ciphertext, nonce = server_secret_crypto.encrypt(PLAINTEXT)
        monkeypatch.setenv("FEED_CREDENTIAL_KEY", "cd" * 32)
        with pytest.raises(InvalidTag):
            server_secret_crypto.decrypt(ciphertext, nonce)

    def test_missing_key_raises_outside_testing_mode(self, monkeypatch):
        monkeypatch.delenv("FEED_CREDENTIAL_KEY", raising=False)
        monkeypatch.delenv("CONFIG_MODE", raising=False)
        with pytest.raises(KeyError):
            server_secret_crypto.encrypt(PLAINTEXT)

    def test_wrong_length_key_rejected(self, monkeypatch):
        monkeypatch.setenv("FEED_CREDENTIAL_KEY", "ab" * 10)
        with pytest.raises(ValueError):
            server_secret_crypto.encrypt(PLAINTEXT)
