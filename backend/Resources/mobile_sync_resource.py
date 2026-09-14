from http import HTTPStatus
import logging

from flask import Blueprint, abort, g, jsonify, request
from sqlalchemy.exc import NoResultFound
from werkzeug.exceptions import HTTPException

from Services.Middleware.auth_middleware import JWTService
from Services.Middleware.privileges_middleware import require_owner
from Services.mobile_sync_service import MobileSyncService

logger = logging.getLogger(__name__)

MOBILE_SYNC_ENDPOINT = "/api/v1/sync"
mobile_sync_api = Blueprint("mobile_sync", __name__, url_prefix=MOBILE_SYNC_ENDPOINT)


@mobile_sync_api.route("/trip/<string:trip_id>/pull", methods=["GET"])
@JWTService.authenticate_restful
@require_owner("trip", id_param="trip_id")
def pull_changes(trip_id: str):
    """
    ---
    get:
      summary: Mobile sync-down — everything except the route (WatermelonDB pullChanges shape)
      parameters:
        - name: lastPulledAt
          in: query
          required: false
          schema:
            type: integer
          description: Epoch milliseconds of the device's last successful pull; omitted on first sync.
      responses:
        200:
          description: Changed/deleted rows per table since lastPulledAt, plus a server timestamp
        400:
          description: lastPulledAt was present but not a valid integer
    """
    raw = request.args.get("lastPulledAt")
    last_pulled_at = None
    if raw is not None:
        try:
            last_pulled_at = int(raw)
        except ValueError:
            abort(HTTPStatus.BAD_REQUEST, description="lastPulledAt must be an integer (epoch ms)")

    result = MobileSyncService.pull_changes(trip_id, last_pulled_at)
    return jsonify(result), HTTPStatus.OK


@mobile_sync_api.route("/trip/<string:trip_id>/push", methods=["POST"])
@JWTService.authenticate_restful
@require_owner("trip", id_param="trip_id")
def push_changes(trip_id: str):
    """
    ---
    post:
      summary: Mobile sync-up for trip_members/requirement_contributions (WatermelonDB pushChanges shape)
      description: >
        A device may only push changes to its own trip_member row and its own
        requirement contributions. Weather and sea are read-only and rejected
        if present.
      responses:
        200:
          description: Changes applied
        400:
          description: Invalid payload, or weather/sea included (read-only)
        403:
          description: Attempted to push another member's row
        404:
          description: Caller is not a member of this trip
    """
    body = request.get_json(silent=True) or {}
    changes = body.get("changes")
    if not isinstance(changes, dict):
        abort(HTTPStatus.BAD_REQUEST, description="changes object is required")

    try:
        MobileSyncService.push_changes(trip_id, changes, g.current_user_id)
        return jsonify({"accepted": True}), HTTPStatus.OK
    except NoResultFound as e:
        abort(HTTPStatus.NOT_FOUND, description=str(e))
    except PermissionError as e:
        abort(HTTPStatus.FORBIDDEN, description=str(e))
    except ValueError as e:
        abort(HTTPStatus.BAD_REQUEST, description=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error("mobile_sync_push_error", extra={"trip_id": trip_id, "error": str(e)})
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))
