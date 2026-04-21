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
import os
from celery import Celery
from dotenv import load_dotenv

load_dotenv()

celery_app = Celery(
    "kayak_expedition_planner",
    broker=os.getenv("RABBITMQ_URL", "amqp://guest:guest@localhost:5672/"),
    include=["Tasks.ping"],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    # Use per-consumer QoS (global=False in basic.qos) — avoids the
    # RabbitMQ global_qos deprecation warning introduced in RabbitMQ 3.12.
    broker_transport_options={'global_qos': False},
    # Disable remote control (celery inspect/control). Removes the transient
    # non-exclusive pidbox queues that trigger the transient_nonexcl_queues
    # deprecation warning in RabbitMQ 3.12+.
    worker_enable_remote_control=False,
)


def init_celery(app):
    """
    Bind Celery to a Flask app so that tasks run inside an application context.

    Call this from the Flask app factory after the app is fully configured.

    Args:
        app: The Flask application instance.
    """
    class ContextTask(celery_app.Task):
        def __call__(self, *args, **kwargs):
            with app.app_context():
                return self.run(*args, **kwargs)

    celery_app.Task = ContextTask
    return celery_app
