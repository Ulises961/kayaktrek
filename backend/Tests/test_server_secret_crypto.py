import pytest
from cryptography.exceptions import InvalidTag

from Services.Utils import server_secret_crypto

PLAINTEXT = "hunter2"


@pytest.fixture(autouse=True)
def _feed_credential_key(app, monkeypatch):
    # `app` (Tests/conftest.py) keeps one Flask app context pushed for the whole test
    # session, so server_secret_crypto._key() always resolves via current_app.config —
    # monkeypatching the env var alone (with no app context around) is only what an
    # out-of-context caller would see, not what these tests exercise.
    monkeypatch.setitem(app.config, "FEED_CREDENTIAL_KEY", "ab" * 32)


class TestEncryptDecrypt:
    def test_round_trips(self):
        ciphertext, nonce = server_secret_crypto.encrypt(PLAINTEXT)
        assert server_secret_crypto.decrypt(ciphertext, nonce) == PLAINTEXT

    def test_ciphertext_is_not_plaintext(self):
        ciphertext, _ = server_secret_crypto.encrypt(PLAINTEXT)
        assert PLAINTEXT not in ciphertext

    def test_wrong_key_fails_to_decrypt(self, app, monkeypatch):
        ciphertext, nonce = server_secret_crypto.encrypt(PLAINTEXT)
        monkeypatch.setitem(app.config, "FEED_CREDENTIAL_KEY", "cd" * 32)
        with pytest.raises(InvalidTag):
            server_secret_crypto.decrypt(ciphertext, nonce)

    def test_missing_key_raises_outside_app_context(self, monkeypatch):
        # No app context pushed by this test itself, but Tests/conftest.py's
        # session-scoped `app` fixture keeps one pushed for the whole suite once any
        # test has requested it — clear both layers _key() checks.
        monkeypatch.delenv("FEED_CREDENTIAL_KEY", raising=False)
        try:
            from flask import current_app
            monkeypatch.setitem(current_app.config, "FEED_CREDENTIAL_KEY", "")
        except RuntimeError:
            pass
        with pytest.raises(KeyError):
            server_secret_crypto.encrypt(PLAINTEXT)

    def test_wrong_length_key_rejected(self, app, monkeypatch):
        monkeypatch.setitem(app.config, "FEED_CREDENTIAL_KEY", "ab" * 10)
        with pytest.raises(ValueError):
            server_secret_crypto.encrypt(PLAINTEXT)
