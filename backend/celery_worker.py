"""
Celery worker entrypoint.

Importing this module creates the Flask app (which calls init_celery) so that
all tasks run inside a Flask application context.  Start the worker with:

    celery -A celery_worker worker --loglevel=info
"""
import os
from dotenv import load_dotenv
from Api.app import createApp
from Api.celery_app import celery_app  # noqa: F401 — re-exported for Celery's -A flag

load_dotenv()
_app = createApp(os.getenv("CONFIG_MODE", "development"))
