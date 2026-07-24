import os
from functools import lru_cache

import redis


@lru_cache(maxsize=1)
def live_redis() -> redis.Redis:
    return redis.Redis.from_url(
        os.getenv("LIVE_REDIS_URL", "redis://localhost:6379/3"),
        decode_responses=True,
    )
