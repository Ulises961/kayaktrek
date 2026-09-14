import os
from logging.config import fileConfig
from dotenv import load_dotenv

from flask import Flask
from sqlalchemy import pool
from sqlalchemy import engine_from_config

from alembic import context

load_dotenv()

# Alembic Config object — provides access to values in alembic.ini
config = context.config

# Set sqlalchemy.url from the environment so alembic.ini never needs a hardcoded string.
db_url = os.getenv("DATABASE_URL") or os.getenv("DEVELOPMENT_DATABASE_URL")
if db_url:
    config.set_main_option("sqlalchemy.url", db_url)

# Set up loggers from the ini file (only when the file actually exists —
# Flask-Migrate sets config_file_name to a path that may not resolve)
if config.config_file_name is not None and os.path.exists(config.config_file_name):
    fileConfig(config.config_file_name)

# Build a minimal Flask app just to initialise SQLAlchemy and collect metadata.
# Avoids spinning up mail, limiter, Celery, etc., which require live services.
from Api.database import db

_app = Flask(__name__)
_app.config["SQLALCHEMY_DATABASE_URI"] = db_url or "sqlite:///:memory:"
_app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
db.init_app(_app)

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
from Models.requirement_contribution import RequirementContribution  # noqa: F401
from Models.personal_packing_item import PersonalPackingItem  # noqa: F401
from Models.log import Log                            # noqa: F401
from Models.image import Image                        # noqa: F401
from Models.sea import Sea                            # noqa: F401
from Models.sea_state import SeaState                 # noqa: F401
from Models.weather import Weather                    # noqa: F401
from Models.weather_state import WeatherState         # noqa: F401
from Models.auth_token import AuthToken               # noqa: F401
from Models.session import Session                    # noqa: F401
from Models.invitation import Invitation              # noqa: F401
from Models.user_certification import UserCertification          # noqa: F401
from Models.user_has_profile_picture import userHasProfilePicture  # noqa: F401
from Models.logistics import Logistics                # noqa: F401
from Models.travel_document import TravelDocument     # noqa: F401
from Models.shuttle_vehicle import ShuttleVehicle     # noqa: F401
from Models.shuttle_passenger import ShuttlePassenger # noqa: F401
from Models.tidal_station import TidalStation         # noqa: F401
from Models.tidal_stream_entry import TidalStreamEntry # noqa: F401
from Models.place_category import PlaceCategory        # noqa: F401
from Models.place import Place                         # noqa: F401
from Models.connection import Connection               # noqa: F401
from Models.block import Block                          # noqa: F401
from Models.endorsement_request import EndorsementRequest  # noqa: F401
from Models.catalog_item import CatalogItem             # noqa: F401
from Models.medical_notes_access_log import MedicalNotesAccessLog  # noqa: F401
from Models.position_ping import PositionPing           # noqa: F401
from Models.wind_diamond import WindDiamond              # noqa: F401
from Models.sync_tombstone import SyncTombstone           # noqa: F401

with _app.app_context():
    target_metadata = db.metadata

# PostGIS and other extension-owned tables that Alembic must never touch.
EXCLUDE_TABLES = {"spatial_ref_sys", "geometry_columns", "geography_columns", "raster_columns", "raster_overviews"}


def include_object(object, name, type_, reflected, compare_to):
    """Filter out extension-owned tables from autogenerate comparison."""
    if type_ == "table" and name in EXCLUDE_TABLES:
        return False
    return True


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
        include_object=include_object,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode (connects to the live database)."""
    # Pin search_path to public only. The postgis/postgis Docker image auto-installs
    # postgis_tiger_geocoder/postgis_topology and ALTERs the role's default search_path to
    # include their schemas ("tiger", "topology") — SQLAlchemy's reflection with schema=None
    # then walks the whole search_path, surfacing ~35 extension-owned tables as "removed"
    # during autogenerate/check. Pinning search_path avoids relying on an ever-growing
    # EXCLUDE_TABLES list of extension-internal table names.
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
        connect_args={"options": "-csearch_path=public"},
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            include_object=include_object,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
