import logging
from http import HTTPStatus

from flask import Blueprint, jsonify
from sqlalchemy import text

from Api.database import db
from Api.limiter import limiter

logger = logging.getLogger(__name__)
health_api = Blueprint("health", __name__, url_prefix="/api/v1")


@health_api.route("/health", methods=["GET"])
@limiter.exempt
def health():
    """Liveness/readiness probe for the compose healthcheck / a future load balancer.
    No auth (a prerequisite for a healthcheck) and exempt from the default rate limit
    (polled far more often than the 200/hour default allows). Pings the DB so a backend
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
        db.session.execute(text("SELECT 1"))
        return jsonify({"status": "ok"}), HTTPStatus.OK
    except Exception as e:
        logger.error("health_check_failed", extra={"error": str(e)})
        return jsonify({"status": "error"}), HTTPStatus.SERVICE_UNAVAILABLE
