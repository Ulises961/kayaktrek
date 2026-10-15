from http import HTTPStatus

import logging

from flask import Blueprint, abort, g, jsonify, request
from flask.typing import ResponseReturnValue
from sqlalchemy.exc import NoResultFound

from Schemas.endorsement_request_schema import EndorsementRequestSchema
from Services.endorsement_request_service import EndorsementRequestService
from Services.log_service import LogNotEndorsableError
from Services.Middleware.auth_middleware import JWTService

logger = logging.getLogger(__name__)

ENDORSEMENT_REQUEST_ENDPOINT = "/api/v1/endorsement-requests"
endorsement_request_api = Blueprint(
    "endorsement_request", __name__, url_prefix=ENDORSEMENT_REQUEST_ENDPOINT
)


@endorsement_request_api.route("", methods=["GET"])
@JWTService.authenticate_restful
def list_requests() -> ResponseReturnValue:
    """GET /api/v1/endorsement-requests?direction=incoming|outgoing — pending requests.
    ---
    get:
      summary: List the caller's pending endorsement requests
      description: >
        `direction=incoming` (default) lists requests addressed to the caller;
        `direction=outgoing` lists requests the caller has made.
      parameters:
        - name: direction
          in: query
          required: false
          schema:
            type: string
            enum: [incoming, outgoing]
            default: incoming
      responses:
        200:
          description: The matching endorsement requests
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/EndorsementRequestSchema'
        400:
          description: Invalid direction value
    """
    try:
        direction = request.args.get("direction", "incoming")
        requests = EndorsementRequestService.list_requests(g.current_user_id, direction)
        return jsonify(EndorsementRequestSchema(many=True).dump(requests)), HTTPStatus.OK
    except ValueError as e:
        abort(HTTPStatus.BAD_REQUEST, description=str(e))


@endorsement_request_api.route("", methods=["POST"])
@JWTService.authenticate_restful
def create_request() -> ResponseReturnValue:
    """POST /api/v1/endorsement-requests — author asks a trip-mate to endorse a log.

    Body: {"logId": "<uuid>", "addresseeUsername": "<name>" | "addresseeId": "<uuid>"}.
    ---
    post:
      summary: Request an endorsement for a log
      description: >
        The addressee must be identified by exactly one of `addresseeUsername`
        or `addresseeId`, and must share a trip with the caller for the log's date.
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required: [logId]
              properties:
                logId:
                  type: string
                addresseeUsername:
                  type: string
                addresseeId:
                  type: string
      responses:
        201:
          description: The created endorsement request
          content:
            application/json:
              schema: EndorsementRequestSchema
        400:
          description: logId missing, or neither addresseeUsername nor addresseeId provided
        403:
          description: Caller is not the log's author
        404:
          description: Log or paddler not found
        409:
          description: A pending request already exists, or the addressee cannot endorse this log
        422:
          description: The log is not endorsable (e.g. self-endorsement, no shared trip)
    """
    try:
        body = request.get_json(silent=True) or {}
        log_id = body.get("logId")
        addressee_username = body.get("addresseeUsername")
        addressee_id = body.get("addresseeId")
        if not log_id:
            abort(HTTPStatus.BAD_REQUEST, description="'logId' is required")
        if not addressee_username and not addressee_id:
            abort(
                HTTPStatus.BAD_REQUEST,
                description="'addresseeUsername' or 'addresseeId' is required",
            )
        endorsement_request = EndorsementRequestService.create_request(
            g.current_user_id,
            log_id,
            addressee_username=addressee_username,
            addressee_id=addressee_id,
        )
        return jsonify(EndorsementRequestSchema().dump(endorsement_request)), HTTPStatus.CREATED
    except LogNotEndorsableError as e:
        abort(HTTPStatus.UNPROCESSABLE_ENTITY, description=str(e))
    except PermissionError as e:
        abort(HTTPStatus.FORBIDDEN, description=str(e))
    except ValueError as e:
        abort(HTTPStatus.CONFLICT, description=str(e))
    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description="Log or paddler not found")


@endorsement_request_api.route("/<request_id>", methods=["DELETE"])
@JWTService.authenticate_restful
def remove_request(request_id: str) -> ResponseReturnValue:
    """DELETE /api/v1/endorsement-requests/<id> — author cancels or addressee declines.
    ---
    delete:
      summary: Cancel or decline an endorsement request
      responses:
        200:
          description: Removal confirmation
          content:
            application/json:
              schema:
                type: object
                properties:
                  message:
                    type: string
        403:
          description: Caller is neither the request's author nor its addressee
        404:
          description: Endorsement request not found
    """
    try:
        EndorsementRequestService.delete_request(request_id, g.current_user_id)
        return jsonify({"message": "Endorsement request removed"}), HTTPStatus.OK
    except PermissionError as e:
        abort(HTTPStatus.FORBIDDEN, description=str(e))
    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description="Endorsement request not found")
