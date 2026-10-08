"""Measurement harness: the real SSE sidecar app, minus the database lookups (M36).

Run it under gunicorn exactly as entrypoint.sh does for SERVICE_ROLE=sse — one gevent worker —
so what is measured is the production process model, not a stand-in. Three things are replaced:
the trip-membership checks (no database rows are needed to hold a stream open), the cap
(raised so it does not interfere), and the rate limiter (CONFIG_MODE=testing disables it). A
ticket endpoint is added so the load client does not need the JWT secret.

    cd backend
    .venv/bin/gunicorn --pythonpath ../scripts/sse-capacity --bind 127.0.0.1:5101 \\
        --workers 1 --worker-class gevent --worker-connections 1200 --timeout 120 \\
        --pid /tmp/sse-capacity.pid harness_sidecar:app
    .venv/bin/python ../scripts/sse-capacity/load_client.py 5101 "$(cat /tmp/sse-capacity.pid)" \\
        100,300,600,1000 40 .env

It talks to whatever Redis `LIVE_REDIS_URL` in backend/.env names, on channels named for random
trip ids, so it does not touch real trips — but do not point it at production.
"""
import os

os.environ.setdefault("CONFIG_MODE", "testing")
os.environ.setdefault("TRIP_CHANGES_MAX_STREAMS", "1000000")

from wsgi_sse import app  # noqa: E402  (monkey-patches gevent first, as production does)

import Resources.live_resource as live_resource  # noqa: E402
from Services.live_stream_service import LiveStreamService  # noqa: E402

live_resource._check_trip_ownership = lambda user_id, trip_id: True
LiveStreamService._is_trip_member = staticmethod(lambda trip_id, user_id: True)

_USER_ID = "00000000-0000-0000-0000-000000000001"


@app.route("/__ticket/<trip_id>")
def _ticket(trip_id):
    return LiveStreamService.mint_changes_ticket(trip_id, _USER_ID)
