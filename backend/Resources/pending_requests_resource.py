from http import HTTPStatus

from flask import Blueprint, g, jsonify
from flask.typing import ResponseReturnValue

from Api.limiter import limiter
from Schemas.pending_requests_schema import PendingRequestsSummarySchema
from Services.Middleware.auth_middleware import JWTService
from Services.pending_requests_service import PendingRequestsService

PENDING_REQUESTS_ENDPOINT = "/api/v1/pending-requests"
pending_requests_api = Blueprint(
    "pending_requests", __name__, url_prefix=PENDING_REQUESTS_ENDPOINT
)

# The inbox badge polls about every 10 s from each open tab and device. Keyed on the user by the
# limiter's default key, so this blocks a runaway loop and not a person with a few clients open.
_SUMMARY_RATE_LIMIT = "60 per minute"


@pending_requests_api.route("/summary", methods=["GET"])
@JWTService.authenticate_restful
@limiter.limit(_SUMMARY_RATE_LIMIT)
def get_summary() -> ResponseReturnValue:
    """GET /api/v1/pending-requests/summary — what is waiting on the caller.
    ---
    get:
      summary: Count the caller's pending requests
      description: >
        Three counts, each from a single query, for the notification badge: trip invitations
        that have not expired, buddy requests addressed to the caller, and endorsement asks
        addressed to the caller. Outgoing requests are not counted.
      responses:
        200:
          description: The counts
          content:
            application/json:
              schema: PendingRequestsSummarySchema
    """
    summary = PendingRequestsService.summary(g.current_user_id)
    return jsonify(PendingRequestsSummarySchema().dump(summary)), HTTPStatus.OK
