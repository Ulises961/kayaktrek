import os
from dotenv import load_dotenv
from sqlalchemy.pool import NullPool
load_dotenv()

class Config:
    SQLALCHEMY_TRACK_MODIFICATIONS = True
    MAIL_SERVER = os.getenv("MAIL_SERVER", "smtp.gmail.com")
    MAIL_PORT = int(os.getenv("MAIL_PORT", 587))
    MAIL_USE_TLS = True
    MAIL_USERNAME = os.getenv("MAIL_USERNAME")
    MAIL_PASSWORD = os.getenv("MAIL_PASSWORD")
    MAIL_DEFAULT_SENDER = os.getenv("MAIL_DEFAULT_SENDER", "noreply@kayakplanner.app")
    FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")

class DevelopmentConfig(Config):
    DEVELOPMENT = True
    DEBUG = True
    SQLALCHEMY_DATABASE_URI = os.getenv("DEVELOPMENT_DATABASE_URL")
    SECRET_KEY = os.getenv("DEVELOPMENT_SECRET_KEY", "dev-secret-key-change-in-production")
    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "dev-jwt-secret-change-in-production")

class TestingConfig(Config):
    TESTING = True
    DEVELOPMENT = True
    DEBUG = True
    SQLALCHEMY_DATABASE_URI = os.getenv("TEST_DATABASE_URL", "sqlite:///:memory:")
    SECRET_KEY = os.getenv("TEST_SECRET_KEY", "test-secret-key")
    JWT_SECRET_KEY = os.getenv("TEST_JWT_SECRET_KEY", "test-jwt-secret-key-minimum-32-bytes!")
    SQLALCHEMY_ENGINE_OPTIONS = {"poolclass": NullPool}
    MAIL_SUPPRESS_SEND = True  # emails are silenced in tests
    
class StagingConfig(Config):
    DEVELOPMENT = True
    DEBUG = True
    SQLALCHEMY_DATABASE_URI = os.getenv("STAGING_DATABASE_URL")
    SECRET_KEY = os.getenv("STAGING_SECRET_KEY")
    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY")
    
class ProductionConfig(Config):
    DEBUG = False
    SQLALCHEMY_DATABASE_URI = os.getenv("PRODUCTION_DATABASE_URL")
    SECRET_KEY = os.getenv("PRODUCTION_SECRET_KEY")
    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY")
config = {
    "development": DevelopmentConfig,
    "testing": TestingConfig,
    "staging": StagingConfig,
    "production": ProductionConfig
}