import uuid

import pytest

from Api.limiter import limiter


@pytest.fixture(autouse=True)
def rate_limits_enabled(app):
    """Enable rate limiting for each test and reset storage before and after."""
    app.config["RATELIMIT_ENABLED"] = True
    limiter.enabled = True
    with app.app_context():
        limiter.reset()
    yield
    with app.app_context():
        limiter.reset()
    app.config["RATELIMIT_ENABLED"] = False
    limiter.enabled = False


class TestLoginRateLimit:

    def test_login_rate_limited_after_threshold(self, client):
        """11th login attempt within a minute returns 429 with Retry-After header."""
        payload = {"mail": "nobody@example.com", "pwd": "x"}

        for _ in range(10):
            client.post("/api/auth/login", json=payload)

        r = client.post("/api/auth/login", json=payload)
        assert r.status_code == 429
        assert "Retry-After" in r.headers

    def test_login_within_limit_not_blocked(self, client):
        """Requests up to the limit are not blocked."""
        payload = {"mail": "nobody@example.com", "pwd": "x"}

        for _ in range(10):
            r = client.post("/api/auth/login", json=payload)
            assert r.status_code != 429


class TestRegisterRateLimit:

    def test_register_rate_limited_after_threshold(self, client):
        """6th register attempt within an hour returns 429."""
        for i in range(5):
            s = uuid.uuid4().hex[:8]
            numeric = str(int(s, 16) % 100_000_000).zfill(8)
            client.post("/api/auth/register", json={
                "mail": f"rl_{s}@example.com",
                "pwd": "Pass9$abc",
                "phone": f"+390{numeric}",
                "name": "RL",
                "username": f"rl_{s}",
            })

        s = uuid.uuid4().hex[:8]
        numeric = str(int(s, 16) % 100_000_000).zfill(8)
        r = client.post("/api/auth/register", json={
            "mail": f"rl_{s}@example.com",
            "pwd": "Pass9$abc",
            "phone": f"+390{numeric}",
            "name": "RL",
            "username": f"rl_{s}",
        })
        assert r.status_code == 429
        assert "Retry-After" in r.headers


class TestForgotPasswordRateLimit:

    def test_forgot_password_rate_limited_after_threshold(self, client):
        """6th forgot-password request within an hour returns 429."""
        for _ in range(5):
            client.post("/api/auth/forgot-password", json={"mail": "nobody@example.com"})

        r = client.post("/api/auth/forgot-password", json={"mail": "nobody@example.com"})
        assert r.status_code == 429
        assert "Retry-After" in r.headers


class TestResendVerificationRateLimit:

    def test_resend_rate_limited_per_email(self, client):
        """4th resend for the same email address within an hour returns 429."""
        for _ in range(3):
            client.post("/api/auth/resend-verification", json={"mail": "rate@example.com"})

        r = client.post("/api/auth/resend-verification", json={"mail": "rate@example.com"})
        assert r.status_code == 429
        assert "Retry-After" in r.headers

    def test_resend_different_emails_not_cross_limited(self, client):
        """Resend limits are per-email: hitting the limit for one address
        does not affect a different address."""
        for _ in range(3):
            client.post("/api/auth/resend-verification", json={"mail": "addr_a@example.com"})

        r = client.post("/api/auth/resend-verification", json={"mail": "addr_b@example.com"})
        assert r.status_code != 429
