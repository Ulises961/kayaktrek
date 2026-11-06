import os

from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

from flask import g

def user_or_ip() -> str:
    if hasattr(g, "current_user_id") and g.current_user_id:
        return f"user:{g.current_user_id}"
    return get_remote_address()

limiter = Limiter(
    key_func=user_or_ip,
    storage_uri=os.getenv("RATELIMIT_STORAGE_URI"),
    # Sized for M36: a page refreshed on every 7 s poll re-runs the layout's reads, ~514 calls an
    # hour per route. Sensitive routes carry their own, stricter limits.
    default_limits=["1000 per hour"],
    headers_enabled=True)
