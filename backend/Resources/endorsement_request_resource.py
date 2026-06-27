from http import HTTPStatus

import logging

from flask import Blueprint, abort, g, jsonify, request
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
def list_requests():
    """GET /api/v1/endorsement-requests?direction=incoming|outgoing — pending requests."""
    try:
        direction = request.args.get("direction", "incoming")
        requests = EndorsementRequestService.list_requests(g.current_user_id, direction)
        return jsonify(EndorsementRequestSchema(many=True).dump(requests)), HTTPStatus.OK
    except ValueError as e:
        abort(HTTPStatus.BAD_REQUEST, description=str(e))
    except Exception as e:
        logger.error(f"Error listing endorsement requests: {e}")
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


@endorsement_request_api.route("", methods=["POST"])
@JWTService.authenticate_restful
def create_request():
    """POST /api/v1/endorsement-requests — author asks a trip-mate to endorse a log.

    Body: {"logId": "<uuid>", "addresseeUsername": "<name>" | "addresseeId": "<uuid>"}.
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
def remove_request(request_id: str):
    """DELETE /api/v1/endorsement-requests/<id> — author cancels or addressee declines."""
    try:
        EndorsementRequestService.delete_request(request_id, g.current_user_id)
        return jsonify({"message": "Endorsement request removed"}), HTTPStatus.OK
    except PermissionError as e:
        abort(HTTPStatus.FORBIDDEN, description=str(e))
    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description="Endorsement request not found")
