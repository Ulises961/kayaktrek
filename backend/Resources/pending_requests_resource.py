from http import HTTPStatus

from flask import Blueprint, g, jsonify, request
from flask.typing import ResponseReturnValue

from Api.limiter import limiter
from Schemas.pending_requests_schema import PendingRequestsSummarySchema
from Services.Middleware.auth_middleware import JWTService
from Services.notification_service import NotificationService
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
        Counts, each from a single query, which together are the notification badge: trip
        invitations that have not expired, buddy requests addressed to the caller, endorsement
        asks addressed to the caller, and the accepted trip invitations and buddy requests the
        caller sent that they have not yet seen.
      responses:
        200:
          description: The counts
          content:
            application/json:
              schema: PendingRequestsSummarySchema
    """
    summary = PendingRequestsService.summary(g.current_user_id)
    return jsonify(PendingRequestsSummarySchema().dump(summary)), HTTPStatus.OK


@pending_requests_api.route("/notifications/read", methods=["POST"])
@JWTService.authenticate_restful
@limiter.limit(_SUMMARY_RATE_LIMIT)
def mark_notifications_read() -> ResponseReturnValue:
    """POST /api/v1/pending-requests/notifications/read — clear one kind of notification.
    ---
    post:
      summary: Mark the caller's unseen notifications of one kind as read
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                kind:
                  type: string
                  enum: [trip_invitation_accepted, buddy_request_accepted]
              required:
                - kind
      responses:
        200:
          description: How many were marked
          content:
            application/json:
              schema:
                type: object
                properties:
                  marked:
                    type: integer
        400:
          description: An unrecognised kind
    """
    body = request.get_json(silent=True) or {}
    marked = NotificationService.mark_read(g.current_user_id, body.get("kind"))
    return jsonify({"marked": marked}), HTTPStatus.OK
