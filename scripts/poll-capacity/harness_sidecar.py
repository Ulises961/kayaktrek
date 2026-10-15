"""Measurement harness: the real SSE sidecar app, minus the database lookups (M36).

Run it under gunicorn exactly as entrypoint.sh does for SERVICE_ROLE=sse — one gevent worker —
so what is measured is the production process model, not a stand-in. Two things are replaced:
the trip-membership check (no database rows are needed to answer a poll) and the rate limiter
(CONFIG_MODE=testing disables it). A ticket endpoint is added so the load client does not need
the JWT secret.

    cd backend
    .venv/bin/gunicorn --pythonpath ../scripts/poll-capacity --bind 127.0.0.1:5101 \\
        --workers 1 --worker-class gevent --worker-connections 200 --timeout 120 \\
        --pid /tmp/poll-capacity.pid harness_sidecar:app
    .venv/bin/python ../scripts/poll-capacity/load_client.py 5101 "$(cat /tmp/poll-capacity.pid)" \\
        100,300,600 40 7 20 .env

It talks to whatever Redis `LIVE_REDIS_URL` in backend/.env names, on keys named for random trip
ids, so it does not touch real trips — but do not point it at production.
"""
import os

os.environ.setdefault("CONFIG_MODE", "testing")

from wsgi_sse import app  # noqa: E402  (monkey-patches gevent first, as production does)

from Services.live_stream_service import LiveStreamService  # noqa: E402

LiveStreamService._is_trip_member = staticmethod(lambda trip_id, user_id: True)

_USER_ID = "00000000-0000-0000-0000-000000000001"


@app.route("/__ticket/<trip_id>")
def _ticket(trip_id):
    return LiveStreamService.mint_changes_ticket(trip_id, _USER_ID)
