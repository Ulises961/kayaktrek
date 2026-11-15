"""
Celery application factory.

Initialises Celery with the Flask application context so that tasks can
access the database, config, and any other Flask extensions without
additional setup.

Usage (starting a worker):
    celery -A Api.celery_app worker --loglevel=info

Usage (inside a task):
    from Api.celery_app import celery_app

    @celery_app.task
    def my_task():
        ...
"""
import logging
import os
from typing import Any

from celery import Celery
from celery.schedules import crontab
from celery.signals import after_setup_logger
from dotenv import load_dotenv
from flask import Flask
from kombu.transport.pyamqp import Transport as _AMQPTransport

# Kombu returns False for RabbitMQ >= 3.3, which causes Celery to call
# basic_qos with global_=True (channel-level QoS). RabbitMQ 3.12 deprecated
# that flag. Returning True here makes Celery use global_=False (per-consumer
# QoS), which RabbitMQ >= 3.3 implements correctly.
_AMQPTransport.qos_semantics_matches_spec = lambda self, connection: True  # type: ignore[method-assign]  # kombu types it as a method; replacing it on the class is the point

load_dotenv()

celery_app = Celery(
    "kayak_expedition_planner",
    broker=os.getenv("RABBITMQ_URL", "amqp://guest:guest@localhost:5672/"),
    include=[
        "Tasks.ping",
        "Tasks.data_export",
        "Tasks.erasure",
        "Tasks.weather_fetch_task",
        "Tasks.weather_beat_task",
        "Tasks.checkpoint_beat_task",
        "Tasks.expedition_log_task",
        "Tasks.session_cleanup_task",
        "Tasks.tile_cache_task",
        "Tasks.satellite_feed_beat_task",
        "Tasks.processed_mutation_task",
    ],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    worker_enable_remote_control=False,
    # Celery's default (True) wipes the root logger's handlers — including our JsonFormatter and
    # RequestContextFilter from setup_logging() — when the worker bootstraps, replacing them with
    # a plain-text formatter. Task loggers (Tasks.*) hang off root, not the "celery" namespace
    # that _configure_celery_logger covers, so they would lose JSON formatting and trace correlation.
    worker_hijack_root_logger=False,
    beat_schedule={
        "daily-gdpr-erasure": {
            "task": "Tasks.erasure.run_erasure",
            "schedule": 86400,
        },
        # crontab, not a seconds interval: beat's schedule file lives in /tmp, so an interval's
        # countdown restarts on every deploy and a 24h one never fires on a box released more
        # often than daily. The two sweeps own disjoint days (Tasks/weather_beat_task.py) and run
        # at :20 to stay clear of the hourly checkpoint alerts. See docs/adr/features.md §1a.
        "weather-refresh": {
            "task": "Tasks.weather_beat_task.refresh_upcoming_weather",
            "schedule": crontab(minute=20, hour=3),
        },
        "weather-refresh-urgent": {
            "task": "Tasks.weather_beat_task.refresh_urgent_weather",
            "schedule": crontab(minute=20, hour="*/6"),
        },
        "checkpoint-alerts": {
            "task": "Tasks.checkpoint_beat_task.check_missed_checkpoints",
            "schedule": crontab(minute=0),
        },
        "nightly-log-fallback": {
            "task": "Tasks.expedition_log_task.nightly_log_fallback",
            "schedule": crontab(minute=30, hour=0),
        },
        "session-cleanup": {
            "task": "Tasks.session_cleanup_task.purge_dead_sessions",
            "schedule": crontab(minute=45, hour=3),
        },
        # 04:15 rather than alongside the others: this one walks the whole tile cache and
        # the nightly pg_dump is the other big disk consumer, so they are kept apart.
        "tile-cache-prune": {
            "task": "Tasks.tile_cache_task.prune_tile_cache",
            "schedule": crontab(minute=15, hour=4),
        },
        # Drops the idempotency record of offline changes processed more than 90 days ago.
        "processed-mutation-prune": {
            "task": "Tasks.processed_mutation_task.prune_processed_mutations",
            "schedule": crontab(minute=50, hour=3),
        },
        # Every ~10 minutes, matching inReach's own typical tracking interval
        # (satellite-feed-spec.md §3.1).
        "satellite-feed-poll": {
            "task": "Tasks.satellite_feed_beat_task.poll_satellite_feeds",
            "schedule": crontab(minute="*/10"),
        },
    },
)


@after_setup_logger.connect
def _configure_celery_logger(logger: logging.Logger, **kwargs: Any) -> None:
    root = logging.getLogger()
    logger.handlers = root.handlers
    logger.setLevel(root.level)


def init_celery(app: Flask) -> Celery:
    """
    Bind Celery to a Flask app so that tasks run inside an application context.

    Call this from the Flask app factory after the app is fully configured.

    Args:
        app: The Flask application instance.
    """
    class ContextTask(celery_app.Task):  # type: ignore[name-defined]  # the app-bound Task class
        def __call__(self, *args: Any, **kwargs: Any) -> Any:
            with app.app_context():
                return self.run(*args, **kwargs)

    celery_app.Task = ContextTask
    return celery_app
