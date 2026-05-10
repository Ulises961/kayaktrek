from http import HTTPStatus

from flask import Blueprint, g, jsonify, request, abort
from marshmallow import ValidationError
from sqlalchemy.exc import NoResultFound
import logging

from Schemas.shuttle_assignment_schema import ShuttleAssignmentSchema
from Services.shuttle_service import ShuttleService
from Services.Middleware.auth_middleware import JWTService
from Services.Middleware.privileges_middleware import require_owner

logger = logging.getLogger(__name__)

SHUTTLE_ENDPOINT = "/api/shuttle"
shuttle_api = Blueprint("shuttle", __name__, url_prefix=SHUTTLE_ENDPOINT)


@shuttle_api.route("/<trip_id>/all", methods=["GET"])
@JWTService.authenticate_restful
@require_owner("trip", id_param="trip_id")
def list_assignments(trip_id: str):
    assignments = ShuttleService.list_for_trip(trip_id)
    return jsonify(ShuttleAssignmentSchema(many=True).dump(assignments)), HTTPStatus.OK


@shuttle_api.route("/<trip_id>/create", methods=["POST"])
@JWTService.authenticate_restful
@require_owner("trip", id_param="trip_id")
def create_assignment(trip_id: str):
    try:
        assignment = ShuttleService.create(trip_id, request.get_json(silent=True) or {}, g.current_user_id)
        return jsonify(ShuttleAssignmentSchema().dump(assignment)), HTTPStatus.CREATED
    except ValidationError as e:
        abort(HTTPStatus.UNPROCESSABLE_ENTITY, description=e.messages)
    except NoResultFound as e:
        abort(HTTPStatus.NOT_FOUND, description=str(e))
    except ValueError as e:
        abort(HTTPStatus.BAD_REQUEST, description=str(e))
    except Exception as e:
        logger.error("shuttle_create_error", extra={"error": str(e)})
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


@shuttle_api.route("/<id>", methods=["PATCH"])
@JWTService.authenticate_restful
@require_owner("shuttle_assignment")
def update_assignment(id: str):
    try:
        assignment = ShuttleService.update(id, request.get_json(silent=True) or {}, g.current_user_id)
        return jsonify(ShuttleAssignmentSchema().dump(assignment)), HTTPStatus.OK
    except PermissionError as e:
        abort(HTTPStatus.FORBIDDEN, description=str(e))
    except ValueError as e:
        abort(HTTPStatus.FORBIDDEN, description=str(e))
    except NoResultFound as e:
        abort(HTTPStatus.NOT_FOUND, description=str(e))
    except ValidationError as e:
        abort(HTTPStatus.UNPROCESSABLE_ENTITY, description=e.messages)
    except Exception as e:
        logger.error("shuttle_update_error", extra={"error": str(e)})
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


@shuttle_api.route("/<id>", methods=["DELETE"])
@JWTService.authenticate_restful
@require_owner("shuttle_assignment")
def delete_assignment(id: str):
    try:
        ShuttleService.delete(id, g.current_user_id)
        return "", HTTPStatus.NO_CONTENT
    except PermissionError as e:
        abort(HTTPStatus.FORBIDDEN, description=str(e))
    except ValueError as e:
        abort(HTTPStatus.FORBIDDEN, description=str(e))
    except NoResultFound as e:
        abort(HTTPStatus.NOT_FOUND, description=str(e))
    except Exception as e:
        logger.error("shuttle_delete_error", extra={"error": str(e)})
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))
