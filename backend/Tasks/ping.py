"""
Smoke-test task — verifies broker connectivity.

Run with:
    celery -A Api.celery_app call Tasks.ping.ping
Expected result: "pong"
"""
from Api.celery_app import celery_app


@celery_app.task(name="Tasks.ping.ping")
def ping() -> str:
    """
    No-op task that returns "pong".

    Used to verify that the Celery worker can connect to RabbitMQ
    and execute tasks successfully. No side effects.

    Returns:
        "pong"
    """
    return "pong"
