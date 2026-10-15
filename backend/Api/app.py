import os
import uuid

import click
from flask import Flask, g, request
from flask_migrate import Migrate
from werkzeug.middleware.proxy_fix import ProxyFix

from Api.cache import cache
from Api.config import config
from Api.database import db
from Api.limiter import limiter
from Api.mail import mail
from Api.logging_config import setup_logging
from Api.observability import setup_logfire
from Api.openapi import setup_openapi
from Api.error_handlers import register_error_handlers
from Api.seed import seed_item_categories, seed_place_categories
from Api.celery_app import init_celery
from Services.Utils.json_encoder import CustomJSONProvider

from Resources.user_resource import user_api
from Resources.trip_resource import trip_api
from Resources.itinerary_resource import itinerary_api
from Resources.day_resource import day_api
from Resources.point_resource import point_api
from Resources.inventory_resource import inventory_api
from Resources.personal_packing_resource import personal_packing_api
from Resources.item_resource import item_api
from Resources.item_category_resource import item_category_api
from Resources.catalog_item_resource import catalog_item_api
from Resources.log_resource import log_api
from Resources.authentication_resource import api as authApi
from Resources.user_certification_resource import user_certification_api
from Resources.logistics_resource import logistics_api
from Resources.travel_document_resource import travel_document_api
from Resources.shuttle_resource import shuttle_api
from Resources.float_plan_resource import float_plan_api
from Resources.sea_resource import sea_api
from Resources.tidal_station_resource import tidal_station_api
from Resources.tidal_diamond_resource import tidal_diamond_api
from Resources.wind_diamond_resource import wind_diamond_api
from Resources.hazard_diamond_resource import hazard_diamond_api
from Resources.place_resource import place_api
from Resources.connection_resource import connection_api
from Resources.block_resource import block_api
from Resources.endorsement_request_resource import endorsement_request_api
from Resources.dev_resource import dev_api
from Resources.health_resource import health_api
from Resources.tile_resource import tile_api
from Resources.live_resource import live_api
from Resources.session_resource import session_api
from Resources.mobile_sync_resource import mobile_sync_api
from Resources.satellite_feed_resource import satellite_feed_api

# Models without resources — import so SQLAlchemy metadata is complete for drop_all ordering in tests.
from Models.user_has_profile_picture import userHasProfilePicture  # noqa: F401
from Models.travel_document import TravelDocument  # noqa: F401
from Models.shuttle_vehicle import ShuttleVehicle  # noqa: F401
from Models.shuttle_passenger import ShuttlePassenger  # noqa: F401
from Models.position_ping import PositionPing  # noqa: F401
from Models.sync_tombstone import SyncTombstone  # noqa: F401
from Models.satellite_feed import SatelliteFeed  # noqa: F401
from Models.processed_mutation import ProcessedMutation  # noqa: F401

# Imported for the side effect: registers the ORM after_delete listeners that write sync tombstones.
from Services.Utils import sync_tombstones  # noqa: F401

# Imported for the side effect: registers the session listeners that publish trip change notifications.
from Services.Utils import trip_change_events  # noqa: F401


def createApp(config_mode: str, *, schema: str | None = None):
    """
    Creates and configurates the Flask app, the logger to be used throughout  the application
    and the database to use. Returns the configured app that is to be used in the main function.

    Params:
    config_mode -- the mode in which the app is to be run: development | testing | staging | production
    schema      -- optional PostgreSQL schema name; sets search_path so all tables land in that schema.
                   Used by the test suite to isolate parallel workers. "public" stays in
                   search_path (PostGIS's types/functions live there); see Tests/conftest.py for
                   why table *creation* still needs `checkfirst=False` despite that.
    """

    app = Flask(
        __name__,
        template_folder=os.path.join(os.path.dirname(os.path.dirname(__file__)), "templates"),
    )
    app.config.from_object(config[config_mode])

    if schema:
        engine_opts = dict(app.config.get('SQLALCHEMY_ENGINE_OPTIONS', {}))
        connect_args = dict(engine_opts.get('connect_args', {}))
        connect_args['options'] = f"-csearch_path={schema},public"
        engine_opts['connect_args'] = connect_args
        app.config['SQLALCHEMY_ENGINE_OPTIONS'] = engine_opts
    app.register_blueprint(authApi)
    app.register_blueprint(day_api)
    app.register_blueprint(inventory_api)
    app.register_blueprint(personal_packing_api)
    app.register_blueprint(item_api)
    app.register_blueprint(item_category_api)
    app.register_blueprint(catalog_item_api)
    app.register_blueprint(itinerary_api)
    app.register_blueprint(log_api)
    app.register_blueprint(trip_api)
    app.register_blueprint(point_api)
    app.register_blueprint(user_api)
    app.register_blueprint(user_certification_api)
    app.register_blueprint(logistics_api)
    app.register_blueprint(travel_document_api)
    app.register_blueprint(shuttle_api)
    app.register_blueprint(float_plan_api)
    app.register_blueprint(sea_api)
    app.register_blueprint(tidal_station_api)
    app.register_blueprint(tidal_diamond_api)
    app.register_blueprint(wind_diamond_api)
    app.register_blueprint(hazard_diamond_api)
    app.register_blueprint(place_api)
    app.register_blueprint(connection_api)
    app.register_blueprint(block_api)
    app.register_blueprint(endorsement_request_api)
    app.register_blueprint(dev_api)
    app.register_blueprint(health_api)
    app.register_blueprint(tile_api)
    app.register_blueprint(live_api)
    app.register_blueprint(session_api)
    app.register_blueprint(mobile_sync_api)
    app.register_blueprint(satellite_feed_api)

    db.init_app(app)
    mail.init_app(app)
    limiter.init_app(app)
    cache.init_app(app)

    @app.cli.command("seed")
    def seed_command():
        """Seed static reference data (item/place categories). Idempotent — safe to run
        on every deploy. Invoked from the `migrate` compose step after `alembic upgrade
        head`, not at app-factory time, where every gunicorn worker and every Celery and
        migrate process (all of which call createApp()) would race identical inserts."""
        seed_item_categories()
        seed_place_categories()
        click.echo("Seed complete.")

    migrate = Migrate()
    migrate.init_app(app, db, directory='alembic')

    setup_logging(app)
    setup_logfire(app, config_mode)

    # Rate limiting (Api/limiter.py) keys on the peer address, so behind a reverse proxy every
    # client would share the proxy's IP; trusting X-Forwarded-For blindly would make the key
    # spoofable, hence an explicit hop count. Off by default (0 hops) so local and
    # direct-exposure setups are unaffected; a deploy behind N proxies sets PROXY_TRUSTED_HOPS=N.
    # Applied after setup_logfire() so ProxyFix is the outermost WSGI layer: it must resolve the
    # real client IP before the OTel instrumentation wrapped around app.wsgi_app tags spans with it.
    trusted_hops = int(os.environ.get("PROXY_TRUSTED_HOPS", "0"))
    if trusted_hops > 0:
        app.wsgi_app = ProxyFix(  # type: ignore[method-assign]
            app.wsgi_app, x_for=trusted_hops, x_proto=trusted_hops, x_host=trusted_hops
        )

    @app.before_request
    def attach_request_id():
        g.request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))

    register_error_handlers(app)

    app.json_provider_class = CustomJSONProvider

    init_celery(app)

    # The spec is built from the url_map, so every blueprint must be registered before this.
    setup_openapi(app)

    return app
