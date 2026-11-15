import logging
from http import HTTPStatus

import logfire
from flask import Blueprint, jsonify
from flask.typing import ResponseReturnValue
from sqlalchemy import text

from Api.database import db
from Api.limiter import limiter
from Services.mail_service import recent_send_failure_count

logger = logging.getLogger(__name__)
health_api = Blueprint("health", __name__, url_prefix="/api/v1")


@health_api.route("/health", methods=["GET"])
@limiter.exempt
def health() -> ResponseReturnValue:
    """Liveness/readiness probe for the compose healthcheck / a future load balancer.
    No auth (a prerequisite for a healthcheck) and exempt from the default rate limit
    (polled far more often than the 1000/hour default allows). Pings the DB so a backend
    that's up but can't reach Postgres still reports unhealthy.
    ---
    get:
      summary: Liveness/readiness probe
      description: No auth required; exempt from the default rate limit.
      responses:
        200:
          description: The backend and its database connection are healthy
          content:
            application/json:
              schema:
                type: object
                properties:
                  status:
                    type: string
                    example: ok
        503:
          description: The backend cannot reach the database
          content:
            application/json:
              schema:
                type: object
                properties:
                  status:
                    type: string
                    example: error
    """
    try:
        # Suppressed, or this ping is the app's highest-volume record: the backend and the
        # SSE sidecar each poll it every 10s, forever, ~17k spans a day saying "the database
        # answered". `/api/v1/health` is already in Api/observability.py's exclusion list,
        # but that drops only the Flask span; the SQLAlchemy span underneath would arrive
        # as a top-level trace with no parent. Deliberately narrower than the whole
        # request: the failure path below is the one thing here worth alerting on, so it
        # must still reach Logfire.
        with logfire.suppress_instrumentation():
            db.session.execute(text("SELECT 1"))
        return jsonify({"status": "ok"}), HTTPStatus.OK
    except Exception as e:
        logger.error("health_check_failed", extra={"error": str(e)})
        return jsonify({"status": "error"}), HTTPStatus.SERVICE_UNAVAILABLE


@health_api.route("/health/mail", methods=["GET"])
@limiter.exempt
def mail_health() -> ResponseReturnValue:
    """Whether transactional mail has been failing lately, for an external uptime monitor.
    Separate from `/health` on purpose: that one gates the compose healthcheck, and a mail
    provider outage must not make the orchestrator think the backend itself is down.
    ---
    get:
      summary: Transactional mail failure probe
      description: >
        503 when any send failed in the last hour, so a monitor alerts on a provider outage,
        a revoked API key or an unvalidated sender instead of users reporting it. It clears
        by itself an hour after the last failure. A 200 with `status` `unknown` means the
        failure record could not be read, which is not the same as no failures.
      responses:
        200:
          description: No recent failures, or the record is unreadable
        503:
          description: At least one send failed within the window
    """
    failures = recent_send_failure_count()
    if failures is None:
        return jsonify({"status": "unknown"}), HTTPStatus.OK
    if failures:
        return jsonify({"status": "degraded", "recentFailures": failures}), HTTPStatus.SERVICE_UNAVAILABLE
    return jsonify({"status": "ok", "recentFailures": 0}), HTTPStatus.OK
