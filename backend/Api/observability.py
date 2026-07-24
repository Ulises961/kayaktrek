import logfire
from flask import Flask

from Api.database import db


def setup_logfire(app: Flask, config_mode: str) -> None:
    """Configure Logfire (Pydantic's managed OTel backend) and auto-instrument
    Flask, SQLAlchemy, and Celery.

    Safe to call unconditionally in every environment: without LOGFIRE_TOKEN set
    (CI, tests, a dev machine that hasn't configured one), send_to_logfire=
    "if-token-present" makes this a no-op rather than prompting or erroring.
    console=False since spans would otherwise duplicate the JsonFormatter
    stdout stream in an incompatible format.
    """
    logfire.configure(
        send_to_logfire="if-token-present",
        service_name="kayak-backend",
        environment=config_mode,
        console=False,
    )
    logfire.instrument_flask(app)
    with app.app_context():
        logfire.instrument_sqlalchemy(engine=db.engine)
    logfire.instrument_celery()
