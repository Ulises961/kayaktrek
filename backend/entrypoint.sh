#!/bin/sh
set -e

if [ "$#" -gt 0 ]; then
    echo "Starting $1..."
    exec "$@"
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
