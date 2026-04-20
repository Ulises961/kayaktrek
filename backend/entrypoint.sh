#!/bin/sh
set -e

echo "Running database migrations..."
alembic upgrade head

echo "Starting Gunicorn..."
exec gunicorn \
    --bind 0.0.0.0:5000 \
    --workers 2 \
    --timeout 120 \
    --access-logfile - \
    --error-logfile - \
    "Api.app:app"
