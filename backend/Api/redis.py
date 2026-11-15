import os
from functools import lru_cache

import redis


@lru_cache(maxsize=1)
def live_redis() -> redis.Redis:
    return redis.Redis.from_url(
        os.getenv("LIVE_REDIS_URL", "redis://localhost:6379/3"),
        decode_responses=True,
    )


@lru_cache(maxsize=1)
def monitoring_redis() -> redis.Redis:
    """Rolling record of recent transactional-mail send failures (`Services/mail_service.py`).

    Written from inside the failure handler of a request or a Celery task, so the timeouts are
    short: recording a failure must never be what holds that request open.
    """
    return redis.Redis.from_url(
        os.getenv("CACHE_REDIS_URL", "redis://localhost:6379/1"),
        decode_responses=True,
        socket_timeout=0.25,
        socket_connect_timeout=0.25,
    )


@lru_cache(maxsize=1)
def revocation_redis() -> redis.Redis:
    """Denylist of revoked session ids, read once per authenticated request (M17).

    Short timeouts on purpose: the denylist fails open, so a stalled Redis must not
    hold a request open longer than the check is worth.
    """
    return redis.Redis.from_url(
        os.getenv("REVOCATION_REDIS_URL", "redis://localhost:6379/4"),
        decode_responses=True,
        socket_timeout=0.25,
        socket_connect_timeout=0.25,
    )
