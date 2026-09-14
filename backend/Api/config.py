import os
from dotenv import load_dotenv
from sqlalchemy.pool import NullPool

load_dotenv()


class Config:
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    MAIL_SERVER = os.getenv("MAIL_SERVER", "smtp.gmail.com")
    MAIL_PORT = int(os.getenv("MAIL_PORT", 587))
    MAIL_USE_TLS = True
    MAIL_USERNAME = os.getenv("MAIL_USERNAME")
    MAIL_PASSWORD = os.getenv("MAIL_PASSWORD")
    # Falls back to MAIL_USERNAME because Gmail SMTP rejects a sender that doesn't match the
    # authenticated account. Production relays through Brevo, where the two differ by design:
    # the username is an SMTP credential, the sender is an address on the authenticated domain.
    MAIL_DEFAULT_SENDER = os.getenv("MAIL_DEFAULT_SENDER") or os.getenv("MAIL_USERNAME")
    # Rendered in every email footer when set, omitted entirely when not. Left unset by default:
    # publishing a postal address is a trader-identity decision (DSA), not a template default.
    MAIL_POSTAL_ADDRESS = os.getenv("MAIL_POSTAL_ADDRESS", "")
    # Brevo's transactional HTTP API, used instead of SMTP when set. DigitalOcean blocks
    # outbound SMTP (25/465/587) on every droplet, unconditionally — confirmed 2026-09-06,
    # not liftable by a support ticket. Empty (the default) keeps the SMTP path, which is
    # what local dev/mailpit and CI/testing use. See Services/mail_service.py.
    BREVO_API_KEY = os.getenv("BREVO_API_KEY", "")
    FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")
    # Closed-beta registration gate (single shared code). Empty = gate disabled — every
    # environment that hasn't set one (local dev, CI, testing) registers exactly as before.
    INVITE_CODE = os.getenv("INVITE_CODE", "")
    # Medical notes (M3g, client-side crypto since M22) — parked 2026-09-02, off unless a
    # deployment opts in. The code, schema and tests all stay; only the surface is closed.
    # Off is the default precisely because the reason for parking is legal exposure: an
    # environment that forgets to configure this must not end up collecting health data.
    # See docs/adr/safety-privacy.md "Parked" and Api/features.py.
    MEDICAL_NOTES_ENABLED = os.getenv("MEDICAL_NOTES_ENABLED", "").lower() in {"1", "true", "yes"}
    CACHE_TYPE = "RedisCache"
    # M29 satellite feed credential encryption key (Services/Utils/server_secret_crypto.py).
    # Not read into Config as a class attribute — the beat task's worker process reads it
    # directly from the environment on every poll, same reasoning as CHECKPOINT_ALERT_HOURS
    # in Tasks/checkpoint_beat_task.py (beat carries no configuration; every task body,
    # scheduled or request-triggered, runs on the worker). Listed here only as documentation
    # of where it belongs; see .env.example.
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
    # Forced on so the parked feature keeps its whole test suite — parking it must not
    # quietly stop testing it. The flag-off path has its own file
    # (Tests/80_medical_notes_parked_test.py), which overrides this back to False.
    MEDICAL_NOTES_ENABLED = True


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
