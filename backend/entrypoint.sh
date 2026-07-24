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
        --worker-connections 200 \
        --timeout 120 \
        --access-logfile - \
        --error-logfile - \
        "wsgi_sse:app"
else
    echo "Starting Gunicorn..."
    exec gunicorn \
        --bind 0.0.0.0:5000 \
        --workers 2 \
        --timeout 120 \
        --access-logfile - \
        --error-logfile - \
        "wsgi:app"
fi
