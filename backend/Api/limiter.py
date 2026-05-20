import os

from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

from flask import g, request

def user_or_ip():
    if hasattr(g, "current_user_id") and g.current_user_id:
        return f"user:{g.current_user_id}"
    return get_remote_address()

limiter = Limiter(
    key_func=user_or_ip,
    storage_uri=os.getenv("RATE_LIMIT_STORAGE_URI"),
    default_limits=["200 per hour"],
    headers_enabled=True)
