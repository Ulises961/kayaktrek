import uuid

from flask import Flask, g, request
from flask_migrate import Migrate

from Api.config import config
from Api.database import db
from Api.limiter import limiter
from Api.mail import mail
from Api.logging_config import setup_logging
from Api.error_handlers import register_error_handlers
from Api.seed import seed_item_categories
from Api.celery_app import init_celery
from Services.Utils.json_encoder import CustomJSONProvider

from Resources.user_resource import user_api
from Resources.trip_resource import trip_api
from Resources.itinerary_resource import itinerary_api
from Resources.day_resource import day_api
from Resources.point_resource import point_api
from Resources.inventory_resource import inventory_api
from Resources.item_resource import item_api
from Resources.item_category_resource import item_category_api
from Resources.log_resource import log_api
from Resources.authentication_resource import api as authApi


def createApp(config_mode: str):
    """
    Creates and configurates the Flask app, the logger to be used throughout  the application
    and the database to use. Returns the configured app that is to be used in the main function.

    Params:
    config_mode -- the mode in which the app is to be run: development | testing | staging | production
    """

    app = Flask(__name__)
    # Get current config from the config.py file using the config_mode set in .env file
    app.config.from_object(config[config_mode])
    app.register_blueprint(authApi)
    app.register_blueprint(day_api)
    app.register_blueprint(inventory_api)
    app.register_blueprint(item_api)
    app.register_blueprint(item_category_api)
    app.register_blueprint(itinerary_api)
    app.register_blueprint(log_api)
    app.register_blueprint(trip_api)
    app.register_blueprint(point_api)
    app.register_blueprint(user_api)

    db.init_app(app)
    mail.init_app(app)
    limiter.init_app(app)
    with app.app_context():
        if not app.config.get("TESTING"):
            seed_item_categories()

    migrate = Migrate()
    migrate.init_app(app, db, directory='alembic')

    # Configure logging
    setup_logging(app)

    @app.before_request
    def attach_request_id():
        g.request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))

    # Register error handlers
    register_error_handlers(app)

    app.json_provider_class = CustomJSONProvider

    init_celery(app)

    return app
