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
    FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")
    CACHE_TYPE = "RedisCache"
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
