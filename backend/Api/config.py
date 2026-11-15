import os
import re
from dotenv import load_dotenv
from sqlalchemy.pool import NullPool

load_dotenv()

_HTTP_ORIGIN = re.compile(r"^https?://[^/\s]+")


def _frontend_url() -> str:
    """The public origin emailed links are built on, as `f"{FRONTEND_URL}/path"`.

    Without a scheme (`app.example.com`) every one of those links is relative and a mail
    client cannot open it, so a value like that stops the process at import instead of
    shipping broken password-reset and verification mail. Unset or blank falls back to the
    local dev origin; a trailing slash is dropped so the path join cannot double it.
    """
    raw_value = os.getenv("FRONTEND_URL") or "http://localhost:3000"
    if not _HTTP_ORIGIN.match(raw_value):
        raise ValueError(f'FRONTEND_URL must start with http:// or https:// and name a host, got "{raw_value}"')
    return raw_value.rstrip("/")


_FALSE_WORDS = frozenset({"0", "false", "no", "off"})


def _env_flag(name: str, default: bool) -> bool:
    """A boolean environment variable: unset or blank is `default`, and `0`, `false`, `no`
    or `off` (any case) is False. Everything else is True."""
    raw_value = os.getenv(name, "").strip().lower()
    if not raw_value:
        return default
    return raw_value not in _FALSE_WORDS


class Config:
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    MAIL_SERVER = os.getenv("MAIL_SERVER", "smtp.gmail.com")
    MAIL_PORT = int(os.getenv("MAIL_PORT", 587))
    # On for every real relay. The local mailpit sink speaks plain SMTP and offers no STARTTLS,
    # so the dev stack turns it off; with it on, every send there fails and nothing is caught.
    MAIL_USE_TLS = _env_flag("MAIL_USE_TLS", True)
    MAIL_USERNAME = os.getenv("MAIL_USERNAME")
    MAIL_PASSWORD = os.getenv("MAIL_PASSWORD")
    # Falls back to MAIL_USERNAME because Gmail SMTP rejects a sender that doesn't match the
    # authenticated account. Production relays through Brevo, where the two differ by design:
    # the username is an SMTP credential, the sender is an address on the authenticated domain.
    MAIL_DEFAULT_SENDER = os.getenv("MAIL_DEFAULT_SENDER") or os.getenv("MAIL_USERNAME")
    # Rendered in every email footer when set, omitted entirely when not. Left unset by default:
    # publishing a postal address is a trader-identity decision (DSA), not a template default.
    MAIL_POSTAL_ADDRESS = os.getenv("MAIL_POSTAL_ADDRESS", "")
    # Brevo's transactional HTTP API, used instead of SMTP when set: DigitalOcean blocks
    # outbound SMTP (25/465/587) on every droplet. Empty (the default) keeps the SMTP path
    # that local dev (mailpit), CI and testing use. See Services/mail_service.py.
    BREVO_API_KEY = os.getenv("BREVO_API_KEY", "")
    FRONTEND_URL = _frontend_url()
    # Closed-beta registration gate (single shared code). Empty = gate disabled — every
    # environment that hasn't set one (local dev, CI, testing) registers exactly as before.
    INVITE_CODE = os.getenv("INVITE_CODE", "")
    # Medical notes are parked: off unless a deployment opts in. The reason is legal exposure
    # (special-category health data), so an environment that forgets to configure this must not
    # end up collecting it. See docs/adr/safety-privacy.md "Parked" and Api/features.py.
    MEDICAL_NOTES_ENABLED = os.getenv("MEDICAL_NOTES_ENABLED", "").lower() in {"1", "true", "yes"}
    # Who may use a paid integration (Services/premium_entitlement_service.py). Blank selects the
    # built-in provider; otherwise `module:Class`. The built-in one answers no to everyone unless
    # PREMIUM_FEATURES_OPEN is set, so a deployment that configures neither opens nothing.
    ENTITLEMENT_PROVIDER = os.getenv("ENTITLEMENT_PROVIDER", "")
    PREMIUM_FEATURES_OPEN = os.getenv("PREMIUM_FEATURES_OPEN", "").lower() in {"1", "true", "yes"}
    CACHE_TYPE = "RedisCache"
    # Key for satellite feed credentials (Services/Utils/server_secret_crypto.py): an application
    # secret rather than a user-derived one, because the beat task decrypts unattended. Empty by
    # default so an environment without satellite feeds still boots; it is required only when a
    # feed is created or polled.
    FEED_CREDENTIAL_KEY = os.getenv("FEED_CREDENTIAL_KEY", "")
    CACHE_DEFAULT_TIMEOUT = 21600  # 6 hours
    CACHE_REDIS_URL = os.getenv("CACHE_REDIS_URL", "redis://localhost:6379/1")


class DevelopmentConfig(Config):
    DEVELOPMENT = True
    DEBUG = True
    SQLALCHEMY_DATABASE_URI = os.getenv("DATABASE_URL")
    SECRET_KEY = os.environ["SECRET_KEY"]
    JWT_SECRET_KEY = os.environ["JWT_SECRET_KEY"]
    RATELIMIT_STORAGE_URI = os.getenv("RATELIMIT_STORAGE_URI", "memory://")


class TestingConfig(Config):
    TESTING = True
    DEVELOPMENT = True
    DEBUG = True
    SQLALCHEMY_DATABASE_URI = os.getenv("TESTING_DATABASE_URL", os.getenv("DATABASE_URL", "sqlite:///:memory:"))
    SECRET_KEY = os.getenv("SECRET_KEY", "test-secret-key")
    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "test-jwt-secret-key-minimum-32-bytes!")
    SQLALCHEMY_ENGINE_OPTIONS = {"poolclass": NullPool}
    MAIL_SUPPRESS_SEND = True
    MAIL_DEFAULT_SENDER = "noreply@test.local"
    RATELIMIT_ENABLED = False
    RATELIMIT_STORAGE_URI = "memory://"
    CACHE_TYPE = "SimpleCache"
    CACHE_DEFAULT_TIMEOUT = 0
    # Forced on so the parked feature keeps its test coverage; the flag-off path is covered by
    # Tests/81_medical_notes_parked_test.py, which overrides this.
    MEDICAL_NOTES_ENABLED = True
    # Pinned so a developer's .env cannot change what the suite asserts about the default provider.
    ENTITLEMENT_PROVIDER = ""
    PREMIUM_FEATURES_OPEN = False
    # A real value may come from a local .env, but the suite must not require every
    # contributor to set one (same as SECRET_KEY above).
    FEED_CREDENTIAL_KEY = os.getenv("FEED_CREDENTIAL_KEY", "00" * 32)


class StagingConfig(Config):
    DEBUG = False
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_DATABASE_URI = os.environ["DATABASE_URL"]
    SECRET_KEY = os.environ["SECRET_KEY"]
    JWT_SECRET_KEY = os.environ["JWT_SECRET_KEY"]
    RATELIMIT_STORAGE_URI = os.environ["RATELIMIT_STORAGE_URI"]


class ProductionConfig(Config):
    DEBUG = False
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_DATABASE_URI = os.environ["DATABASE_URL"]
    SECRET_KEY = os.environ["SECRET_KEY"]
    JWT_SECRET_KEY = os.environ["JWT_SECRET_KEY"]
    RATELIMIT_STORAGE_URI = os.environ["RATELIMIT_STORAGE_URI"]


config = {
    "development": DevelopmentConfig,
    "testing": TestingConfig,
    "staging": StagingConfig,
    "production": ProductionConfig
}
