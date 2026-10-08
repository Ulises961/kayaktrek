#!/bin/sh
set -e

if [ "$#" -gt 0 ]; then
    echo "Starting $1..."
    exec "$@"
elif [ "$SERVICE_ROLE" = "sse" ]; then
    echo "Starting Gunicorn (SSE sidecar)..."
    exec gunicorn \
        --bind 0.0.0.0:5000 \
        --workers 1 \
        --worker-class gevent \
        --worker-connections 600 \
        --timeout 120 \
        --access-logfile - \
        --error-logfile - \
        "wsgi_sse:app"
else
    echo "Starting Gunicorn..."
    # --max-requests recycles a worker after N requests (jitter so they don't all go at
    # once). This is the same bound as Celery's --max-tasks-per-child, and it has a specific
    # job here: the global land mask that tidal_service.py defers costs ~890 MiB in whichever
    # worker first serves a marine field, and stays resident for that worker's life. Without
    # recycling, a backend that has been up a while is permanently carrying it in every
    # worker. Deliberately NOT applied to the SSE role above — recycling there would drop
    # live position streams mid-expedition, and that role never builds a velocity grid.
    exec gunicorn \
        --bind 0.0.0.0:5000 \
        --workers 2 \
        --max-requests 1000 \
        --max-requests-jitter 100 \
        --timeout 120 \
        --access-logfile - \
        --error-logfile - \
        "wsgi:app"
fi
