from http import HTTPStatus
import logging
from flask import Blueprint, abort, g, jsonify, request
from flask.typing import ResponseReturnValue
from sqlalchemy.exc import IntegrityError
from sqlalchemy.exc import NoResultFound
from Schemas.log_schema import LogSchema
from Services.Middleware.auth_middleware import JWTService
from Services.Middleware.privileges_middleware import require_owner
from Services.log_service import LogService, LogNotEndorsableError


logger = logging.getLogger(__name__)

LOG_ENDPOINT = "/api/v1/log"
log_api = Blueprint('log', __name__, url_prefix=LOG_ENDPOINT)


@log_api.route("/all", methods=["GET"])
@JWTService.authenticate_restful
def get_logs() -> ResponseReturnValue:
    """
    LogResource GET method. Retrieves a paginated, sorted, filterable page of a
    user's own logs. Query params: page, per_page (capped 100), sort
    (newest|oldest); min_sea/max_sea (Beaufort severity), min_distance/max_distance.
    ---
    get:
      summary: List the current user's paddling logs
      parameters:
        - name: page
          in: query
          required: false
          schema:
            type: integer
            default: 1
        - name: per_page
          in: query
          required: false
          schema:
            type: integer
            default: 20
        - name: sort
          in: query
          required: false
          schema:
            type: string
            enum: [newest, oldest]
            default: newest
        - name: min_sea
          in: query
          required: false
          schema:
            type: integer
        - name: max_sea
          in: query
          required: false
          schema:
            type: integer
        - name: min_distance
          in: query
          required: false
          schema:
            type: number
        - name: max_distance
          in: query
          required: false
          schema:
            type: number
      responses:
        200:
          description: A page of logs
          content:
            application/json:
              schema:
                type: object
                properties:
                  items:
                    type: array
                    items: LogSchema
                  total:
                    type: integer
                  page:
                    type: integer
                  pages:
                    type: integer
    """
    page = request.args.get("page", 1, type=int)
    per_page = min(request.args.get("per_page", 20, type=int), 100)
    sort = request.args.get("sort", "newest")
    result = LogService.get_logs_by_user(
        g.current_user_id,
        page=page,
        per_page=per_page,
        sort=sort,
        min_sea=request.args.get("min_sea", type=int),
        max_sea=request.args.get("max_sea", type=int),
        min_distance=request.args.get("min_distance", type=float),
        max_distance=request.args.get("max_distance", type=float),
    )
    schema = LogSchema()
    return jsonify({
        "items": [schema.dump(log) for log in result["items"]],
        "total": result["total"],
        "page": result["page"],
        "pages": result["pages"],
    }), HTTPStatus.OK



@log_api.route("/endorsed", methods=["GET"])
@JWTService.authenticate_restful
def get_endorsed_logs() -> ResponseReturnValue:
    """
    LogResource GET method. Retrieves a paginated, sorted, filterable page of logs
    endorsed by the current user. Same query params as GET /api/log/all.
    ---
    get:
      summary: List logs the current user has endorsed
      parameters:
        - name: page
          in: query
          required: false
          schema:
            type: integer
            default: 1
        - name: per_page
          in: query
          required: false
          schema:
            type: integer
            default: 20
        - name: sort
          in: query
          required: false
          schema:
            type: string
            enum: [newest, oldest]
            default: newest
        - name: min_sea
          in: query
          required: false
          schema:
            type: integer
        - name: max_sea
          in: query
          required: false
          schema:
            type: integer
        - name: min_distance
          in: query
          required: false
          schema:
            type: number
        - name: max_distance
          in: query
          required: false
          schema:
            type: number
      responses:
        200:
          description: A page of endorsed logs
          content:
            application/json:
              schema:
                type: object
                properties:
                  items:
                    type: array
                    items: LogSchema
                  total:
                    type: integer
                  page:
                    type: integer
                  pages:
                    type: integer
    """
    page = request.args.get("page", 1, type=int)
    per_page = min(request.args.get("per_page", 20, type=int), 100)
    sort = request.args.get("sort", "newest")
    result = LogService.get_endorsed_logs(
        g.current_user_id,
        page=page,
        per_page=per_page,
        sort=sort,
        min_sea=request.args.get("min_sea", type=int),
        max_sea=request.args.get("max_sea", type=int),
        min_distance=request.args.get("min_distance", type=float),
        max_distance=request.args.get("max_distance", type=float),
    )
    schema = LogSchema()
    return jsonify({
        "items": [schema.dump(log) for log in result["items"]],
        "total": result["total"],
        "page": result["page"],
        "pages": result["pages"],
    }), HTTPStatus.OK


@log_api.route("/stats", methods=["GET"])
@JWTService.authenticate_restful
def get_stats() -> ResponseReturnValue:
    """GET /api/log/stats — aggregate logbook stats for the authenticated user.
    ---
    get:
      summary: Get aggregate logbook stats for the current user
      responses:
        200:
          description: The aggregated stats
          content:
            application/json:
              schema:
                type: object
                properties:
                  totalDistance:
                    type: number
                  totalHours:
                    type: number
                  logCount:
                    type: integer
                  tripCount:
                    type: integer
                  endorsementsReceived:
                    type: integer
                  conditionsDistribution:
                    type: object
                    description: Beaufort sea state (as a string key) mapped to log count
                    additionalProperties:
                      type: integer
                  activityByMonth:
                    type: array
                    items:
                      type: object
                      properties:
                        month:
                          type: string
                          example: "2026-07"
                        distance:
                          type: number
                        hours:
                          type: number
                        count:
                          type: integer
    """
    return jsonify(LogService.stats_for_user(g.current_user_id)), HTTPStatus.OK


@log_api.route("/<string:id>/endorse", methods=["POST"])
@JWTService.authenticate_restful
def endorse_log(id: str) -> ResponseReturnValue:
    """POST /api/log/<id>/endorse — endorse another paddler's log under the same-trip rule.

    Deliberately NOT @require_owner: the endorser is by definition not the author. The
    service enforces who may endorse (shared trip, not self, log is trip-linked).
    ---
    post:
      summary: Endorse another paddler's log
      description: >
        The endorser and the log's author must share a trip; a paddler cannot endorse
        their own log, and the log must be trip-linked to be endorsable at all.
      responses:
        200:
          description: The log was endorsed
          content:
            application/json:
              schema:
                type: object
                properties:
                  message:
                    type: string
        403:
          description: The caller is not permitted to endorse this log
        404:
          description: Log not found
        422:
          description: The log is not structurally eligible for endorsement (not trip-linked)
    """
    try:
        LogService.endorse_log(id, g.current_user_id)
        return jsonify({"message": "Log endorsed"}), HTTPStatus.OK
    except LogNotEndorsableError as e:
        abort(HTTPStatus.UNPROCESSABLE_ENTITY, description=str(e))
    except PermissionError as e:
        abort(HTTPStatus.FORBIDDEN, description=str(e))
    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description=f"Log {id} not found")


@log_api.route("/<string:id>/endorse", methods=["DELETE"])
@JWTService.authenticate_restful
def unendorse_log(id: str) -> ResponseReturnValue:
    """DELETE /api/log/<id>/endorse — withdraw the caller's own endorsement.

    Caller-scoped: removing your own endorsement needs no shared-trip recheck.
    ---
    delete:
      summary: Withdraw the current user's endorsement of a log
      responses:
        200:
          description: The endorsement was withdrawn
          content:
            application/json:
              schema:
                type: object
                properties:
                  message:
                    type: string
        404:
          description: Log not found
    """
    try:
        LogService.unendorse_log(id, g.current_user_id)
        return jsonify({"message": "Endorsement withdrawn"}), HTTPStatus.OK
    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description=f"Log {id} not found")


@log_api.route("/create", methods=["POST"])
@JWTService.authenticate_restful
def post() -> ResponseReturnValue:
    """
    LogResource POST method. Adds a new log to the database.

    :return: Log, 201 HTTP status code.
    ---
    post:
      summary: Create a paddling log
      requestBody:
        content:
          application/json:
            schema: LogSchema
      responses:
        201:
          description: The created log
          content:
            application/json:
              schema: LogSchema
        400:
          description: Validation error
        409:
          description: Database integrity violated
    """
    try:
        from marshmallow.exceptions import ValidationError
        log_json = request.get_json()
        log = LogService.create_log(log_json)
        return jsonify(LogSchema().dump(log)), HTTPStatus.CREATED
    except ValidationError as e:
        logger.error(f"Validation error creating log: {e.messages}")
        abort(HTTPStatus.BAD_REQUEST, description=str(e.messages))
    except IntegrityError as e:
        logger.error(
            f"Integrity Error, this log is already in the database. Error: {e}"
        )
        abort(HTTPStatus.CONFLICT, description="Database integrity violated")

@log_api.route("/<string:id>", methods=["GET"])
@JWTService.authenticate_restful
@require_owner('log', id_param='id')
def get_log(id: str) -> ResponseReturnValue:
    """
    LogResource GET method. Retrieves a paddling log by id.
    ---
    get:
      summary: Get a paddling log by id
      responses:
        200:
          description: The log
          content:
            application/json:
              schema: LogSchema
        404:
          description: Log not found
    """
    try:
        log = LogService.get_log_by_id(id)
        return jsonify(LogSchema().dump(log)), HTTPStatus.OK
    except NoResultFound as e:
        abort(HTTPStatus.NOT_FOUND, description=str(e))


@log_api.route("/<string:id>", methods=["PATCH"])
@JWTService.authenticate_restful
@require_owner('log', id_param='id')
def update_log(id: str) -> ResponseReturnValue:
    """
    PATCH /api/log/<id> — Partially update an existing paddling log.

    Accepts a JSON body with any subset of mutable log fields.
    Only the fields present in the body are applied; omitted fields are left unchanged.
    Authorship fields (userId) are never overwritten by this endpoint.

    Returns:
        200 with the updated log object, or 404 if not found.
    ---
    patch:
      summary: Update a paddling log
      requestBody:
        content:
          application/json:
            schema: LogSchema
      responses:
        200:
          description: The updated log
          content:
            application/json:
              schema: LogSchema
        409:
          description: Database integrity violated
    """
    try:
        updated_log = LogService.update_log(id, request.get_json())

        return jsonify(LogSchema().dump(updated_log)), HTTPStatus.OK
    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description=f"Log {id} not found")
    except IntegrityError as e:
        logger.error(
            f"Integrity Error, this log is already in the database. Error: {e}"
        )
        abort(HTTPStatus.CONFLICT, description="Database integrity violated")

@log_api.route("/<string:id>", methods=["DELETE"])
@JWTService.authenticate_restful
@require_owner('log', id_param='id')
def delete_log(id: str) -> ResponseReturnValue:
    """
    LogResource DELETE method. Deletes a paddling log by id.
    ---
    delete:
      summary: Delete a paddling log
      responses:
        200:
          description: Deletion successful
          content:
            application/json:
              schema:
                type: object
                properties:
                  message:
                    type: string
        404:
          description: Log not found
        409:
          description: Database integrity violated
    """
    try:
        logger.info(f"Deleting log with id {id} ")

        LogService.delete_log(id)
        return jsonify({"message": "Deletion successful"}), HTTPStatus.OK
    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description=f"Log {id} not found")
    except IntegrityError as e:
        logger.error(
            f"Integrity Error, this log is already in the database. Error: {e}"
        )
        abort(HTTPStatus.CONFLICT, description="Database integrity violated")