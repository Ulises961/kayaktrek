"""
M11 §4 — deploy plumbing.

Api/config.py's class-body statements (`os.environ[...]`) evaluate once at MODULE IMPORT
time, not per-instantiation — so testing "fails closed when a var is missing" by monkeypatching
env and re-touching the already-imported class has no effect. These tests import the config
module in a fresh subprocess with a deliberately incomplete environment, which is the only
way to exercise that import-time behaviour without reloading (and corrupting) the shared
module state the rest of this xdist worker's test session depends on.
"""
import os
import subprocess
import sys

import pytest

_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_REQUIRED_STAGING_PROD_VARS = ["SECRET_KEY", "JWT_SECRET_KEY", "DATABASE_URL", "RATELIMIT_STORAGE_URI"]


def _import_config_with_env(env: dict) -> subprocess.CompletedProcess:
    # config.py's load_dotenv() searches upward from Api/config.py's own location, not the
    # subprocess cwd, so it would silently refill any var we strip from `env` with whatever
    # is in the developer's real backend/.env. Neutralise it before Api.config is imported.
    script = "import dotenv; dotenv.load_dotenv = lambda *a, **k: None; import Api.config"
    return subprocess.run(
        [sys.executable, "-c", script],
        cwd=_BACKEND_DIR,
        env=env,
        capture_output=True,
        text=True,
        timeout=30,
    )


def _base_env(**overrides) -> dict:
    env = {k: v for k, v in os.environ.items() if k not in _REQUIRED_STAGING_PROD_VARS}
    env.update({
        "SECRET_KEY": "test-secret",
        "JWT_SECRET_KEY": "test-jwt-secret-minimum-32-bytes!",
        "DATABASE_URL": "postgresql://user:pass@localhost/db",
        "RATELIMIT_STORAGE_URI": "redis://localhost:6379/0",
    })
    env.update(overrides)
    return env


@pytest.mark.parametrize("missing_var", _REQUIRED_STAGING_PROD_VARS)
def test_config_module_fails_closed_when_a_required_var_is_missing(missing_var):
    """Importing Api.config with any of SECRET_KEY/JWT_SECRET_KEY/DATABASE_URL/
    RATELIMIT_STORAGE_URI missing raises KeyError — StagingConfig and ProductionConfig
    read all four via os.environ[...], never os.getenv() with a silent None fallback."""
    env = _base_env()
    del env[missing_var]

    result = _import_config_with_env(env)

    assert result.returncode != 0
    assert "KeyError" in result.stderr
    assert missing_var in result.stderr


def test_config_module_imports_cleanly_when_all_required_vars_present():
    """Sanity check that the harness itself is correct — a complete environment imports fine."""
    result = _import_config_with_env(_base_env())
    assert result.returncode == 0, result.stderr


# ---------------------------------------------------------------------------
# `flask seed` CLI command — replaces the app-factory-time auto-seed, which ran
# on every gunicorn worker / Celery process and could race identical inserts.
# ---------------------------------------------------------------------------

class TestSeedCliCommand:

    def test_seed_command_is_registered(self, app):
        assert "seed" in app.cli.commands

    def test_seed_command_populates_reference_data_and_is_idempotent(self, app):
        from Api.database import db as _db
        from Models.item_category import ItemCategory
        from Models.place_category import PlaceCategory
        from Models.itinerary import Itinerary

        runner = app.test_cli_runner()

        result = runner.invoke(args=["seed"])
        assert result.exit_code == 0, result.output
        assert "Seed complete" in result.output

        assert _db.session.query(ItemCategory).count() > 0
        assert _db.session.query(PlaceCategory).count() > 0
        demo_count_after_first = (
            _db.session.query(Itinerary).filter(Itinerary.user_id.is_(None)).count()
        )
        assert demo_count_after_first > 0

        # Idempotent — running it again must not duplicate the demo itinerary or error.
        result2 = runner.invoke(args=["seed"])
        assert result2.exit_code == 0, result2.output
        demo_count_after_second = (
            _db.session.query(Itinerary).filter(Itinerary.user_id.is_(None)).count()
        )
        assert demo_count_after_second == demo_count_after_first


# ---------------------------------------------------------------------------
# ProxyFix — off by default, opt-in via PROXY_TRUSTED_HOPS so rate limiting keys on
# the real client IP behind a reverse proxy without trusting X-Forwarded-For blindly.
# ---------------------------------------------------------------------------

class TestProxyFixWiring:

    def test_wsgi_app_is_unwrapped_when_proxy_trusted_hops_unset(self, monkeypatch):
        monkeypatch.delenv("PROXY_TRUSTED_HOPS", raising=False)
        from Api.app import createApp
        app = createApp("testing")
        assert type(app.wsgi_app).__name__ != "ProxyFix"

    def test_wsgi_app_is_unwrapped_when_proxy_trusted_hops_is_zero(self, monkeypatch):
        monkeypatch.setenv("PROXY_TRUSTED_HOPS", "0")
        from Api.app import createApp
        app = createApp("testing")
        assert type(app.wsgi_app).__name__ != "ProxyFix"

    def test_wsgi_app_is_wrapped_when_proxy_trusted_hops_is_set(self, monkeypatch):
        monkeypatch.setenv("PROXY_TRUSTED_HOPS", "1")
        from Api.app import createApp
        from werkzeug.middleware.proxy_fix import ProxyFix
        app = createApp("testing")
        assert isinstance(app.wsgi_app, ProxyFix)
        assert app.wsgi_app.x_for == 1

    def test_requests_without_trusted_proxy_header_not_trusted_when_proxy_fix_disabled(self, monkeypatch):
        """Regression guard: when PROXY_TRUSTED_HOPS is not set, X-Forwarded-For
        must NOT be trusted, even if present. A client sending a spoofed X-Forwarded-For
        to bypass rate limiting should see their real IP used, not the header value."""
        monkeypatch.delenv("PROXY_TRUSTED_HOPS", raising=False)
        from Api.app import createApp
        from flask import request

        app = createApp("testing")
        with app.test_request_context(
            "/api/v1/health",
            headers={"X-Forwarded-For": "10.0.0.1"},
            environ_base={"REMOTE_ADDR": "192.168.1.100"},
        ):
            # Without ProxyFix, the request.remote_addr should be the real address,
            # not the spoofed X-Forwarded-For header
            assert request.remote_addr == "192.168.1.100"


# ---------------------------------------------------------------------------
# KeyError handler no longer echoes the missing key name to the client — it can fire
# from internal config/env-var lookups, not just request payloads, and was inconsistent
# with the sanitised ValueError handler.
# ---------------------------------------------------------------------------

def test_key_error_handler_does_not_leak_the_key_name(app):
    # Registering a throwaway route would fail here: by the time the full suite runs, this
    # session-scoped `app` has already served requests, and Flask locks route registration
    # after the first request. Invoke the registered handler directly instead.
    with app.test_request_context():
        response, status = app.handle_user_exception(KeyError("SUPER_SECRET_INTERNAL_VAR_NAME"))

    assert status == 400
    body = response.get_json()
    assert "SUPER_SECRET_INTERNAL_VAR_NAME" not in body["message"]
    assert body["message"] == "A required field is missing from the request"
