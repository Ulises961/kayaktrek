from http import HTTPStatus
import logging

from flask import Blueprint, abort, g, jsonify, request
from flask.typing import ResponseReturnValue
from sqlalchemy.exc import NoResultFound

from Services.Middleware.auth_middleware import JWTService
from Services.Middleware.privileges_middleware import require_leader, require_owner
from Services.itinerary_route_sync_service import RouteSyncService, RouteVersionMismatchError
from Services.mobile_sync_service import MobileSyncService
from Services.mutation_queue_service import MutationQueueService

logger = logging.getLogger(__name__)

MOBILE_SYNC_ENDPOINT = "/api/v1/sync"
mobile_sync_api = Blueprint("mobile_sync", __name__, url_prefix=MOBILE_SYNC_ENDPOINT)


@mobile_sync_api.route("/trip/<string:trip_id>/pull", methods=["GET"])
@JWTService.authenticate_restful
@require_owner("trip", id_param="trip_id")
def pull_changes(trip_id: str) -> ResponseReturnValue:
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


@mobile_sync_api.route("/mutations", methods=["POST"])
@JWTService.authenticate_restful
def apply_mutations() -> ResponseReturnValue:
    """
    ---
    post:
      summary: Apply the changes a phone queued while offline (M9d)
      description: >
        A batch of envelopes, each applied through the ordinary service layer under
        the same permission rules as its online request, in device-timestamp order,
        one transaction each, and exactly once per mutationId however often the
        batch is resent. Not trip-scoped: a batch may touch several trips, logs and
        the caller's own records. The route travels on its own channel.
      responses:
        200:
          description: >
            One result per envelope — applied, rejected (with a reason),
            duplicate (already processed; carries the earlier result), or failed
            (transient; resend it)
        400:
          description: The body carries no mutations list
    """
    body = request.get_json(silent=True) or {}
    mutations = body.get("mutations") if isinstance(body, dict) else None
    if not isinstance(mutations, list):
        abort(HTTPStatus.BAD_REQUEST, description="mutations list is required")

    results = MutationQueueService.apply_batch(g.current_user_id, mutations)
    return jsonify({"results": results}), HTTPStatus.OK


@mobile_sync_api.route("/trip/<string:trip_id>/route/pull", methods=["GET"])
@JWTService.authenticate_restful
@require_owner("trip", id_param="trip_id")
def pull_route(trip_id: str) -> ResponseReturnValue:
    """
    ---
    get:
      summary: Route sync-down — the whole itinerary subtree, atomically (WP1 item 7)
      description: >
        Days and points for the trip's itinerary, with each point's order_key
        (never next_id) and the itinerary's route_version. Any structural
        change resends the whole subtree — there is no delta for the route.
      responses:
        200:
          description: The full route plus its route_version
        404:
          description: Trip has no itinerary
    """
    try:
        result = RouteSyncService.pull_route(trip_id)
        return jsonify(result), HTTPStatus.OK
    except NoResultFound as e:
        abort(HTTPStatus.NOT_FOUND, description=str(e))


@mobile_sync_api.route("/trip/<string:trip_id>/route/push", methods=["POST"])
@JWTService.authenticate_restful
@require_owner("trip", id_param="trip_id")
@require_leader(id_param="trip_id")
def push_route(trip_id: str) -> ResponseReturnValue:
    """
    ---
    post:
      summary: Route sync-up — the ordinary case (WP1 item 7)
      description: >
        Leader-only. Rejects with 409 if baseRouteVersion no longer matches
        the server's — a diverged route is never auto-merged, only detected;
        resolving it is POST .../route/resolve.
      responses:
        200:
          description: Route replaced, new route_version returned
        400:
          description: Invalid payload
        403:
          description: Caller is not the trip leader
        404:
          description: Trip has no itinerary, or a day/point id doesn't belong to it
        409:
          description: baseRouteVersion is stale — the route has diverged
    """
    body = request.get_json(silent=True) or {}
    base_route_version = body.get("baseRouteVersion")
    if base_route_version is None:
        abort(HTTPStatus.BAD_REQUEST, description="baseRouteVersion is required")

    try:
        result = RouteSyncService.push_route(
            trip_id, int(base_route_version), body.get("days", []), body.get("points", [])
        )
        return jsonify(result), HTTPStatus.OK
    except RouteVersionMismatchError as e:
        return jsonify({"error": str(e)}), HTTPStatus.CONFLICT
    except NoResultFound as e:
        abort(HTTPStatus.NOT_FOUND, description=str(e))
    except ValueError as e:
        abort(HTTPStatus.BAD_REQUEST, description=str(e))


@mobile_sync_api.route("/trip/<string:trip_id>/route/resolve", methods=["POST"])
@JWTService.authenticate_restful
@require_owner("trip", id_param="trip_id")
@require_leader(id_param="trip_id")
def resolve_route(trip_id: str) -> ResponseReturnValue:
    """
    ---
    post:
      summary: Route divergence resolution — the human-adjudicated case (WP1 item 8)
      description: >
        Leader-only. The one path allowed to accept a route whose point set
        doesn't match the server's exactly — a human has just compared both
        variants and chosen. Applied as a command (replace-in-one-transaction),
        not a merge; ordinary point-order edits keep going through
        POST /itinerary/<id>/point-order and its 409.
      responses:
        200:
          description: Route replaced, new route_version returned
        400:
          description: Invalid payload
        403:
          description: Caller is not the trip leader
        404:
          description: Trip has no itinerary, or a day/point id doesn't belong to it
    """
    body = request.get_json(silent=True) or {}
    try:
        result = RouteSyncService.resolve_route(trip_id, body.get("days", []), body.get("points", []))
        return jsonify(result), HTTPStatus.OK
    except NoResultFound as e:
        abort(HTTPStatus.NOT_FOUND, description=str(e))
    except ValueError as e:
        abort(HTTPStatus.BAD_REQUEST, description=str(e))
