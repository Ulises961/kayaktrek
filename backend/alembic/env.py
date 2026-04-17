import os
from logging.config import fileConfig
from dotenv import load_dotenv

from sqlalchemy import pool
from sqlalchemy import engine_from_config

from alembic import context

load_dotenv()

# Alembic Config object — provides access to values in alembic.ini
config = context.config

# Override sqlalchemy.url from the environment so alembic.ini never needs
# a hardcoded connection string.
db_url = os.getenv("DEVELOPMENT_DATABASE_URL")
if db_url:
    config.set_main_option("sqlalchemy.url", db_url)

# Set up loggers from the ini file
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Import the Flask app and db so that target_metadata reflects the real schema.
# All models must be imported here (directly or transitively) so SQLAlchemy
# registers them on db.metadata before autogenerate inspects it.
from Api.app import createApp
from Api.database import db

# Import every model so its table is registered on db.metadata
from Models.user import User                          # noqa: F401
from Models.trip import Trip                          # noqa: F401
from Models.trip_member import TripMember             # noqa: F401
from Models.itinerary import Itinerary                # noqa: F401
from Models.day import Day                            # noqa: F401
from Models.point import Point                        # noqa: F401
from Models.inventory import Inventory                # noqa: F401
from Models.item import Item                          # noqa: F401
from Models.item_category import ItemCategory         # noqa: F401
from Models.trip_requirement import TripRequirement   # noqa: F401
from Models.log import Log                            # noqa: F401
from Models.image import Image                        # noqa: F401
from Models.sea import Sea                            # noqa: F401
from Models.sea_state import SeaState                 # noqa: F401
from Models.weather import Weather                    # noqa: F401
from Models.weather_state import WeatherState         # noqa: F401

flask_app = createApp("development")

with flask_app.app_context():
    target_metadata = db.metadata


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode (no live DB connection required).

    Emits SQL to stdout rather than executing it against a live database.
    Useful for generating SQL scripts for review or manual application.
    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode (connects to the live database)."""
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
