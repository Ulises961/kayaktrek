from http import HTTPStatus

from flask import Blueprint, g, jsonify, request, abort
from marshmallow import ValidationError
from sqlalchemy.exc import NoResultFound
import logging

from Schemas.shuttle_vehicle_schema import ShuttleVehicleSchema
from Schemas.shuttle_passenger_schema import ShuttlePassengerSchema
from Services.shuttle_service import ShuttleService
from Services.Middleware.auth_middleware import JWTService
from Services.Middleware.privileges_middleware import require_owner

logger = logging.getLogger(__name__)

SHUTTLE_ENDPOINT = "/api/v1/shuttle"
shuttle_api = Blueprint("shuttle", __name__, url_prefix=SHUTTLE_ENDPOINT)


@shuttle_api.route("/<trip_id>/all", methods=["GET"])
@JWTService.authenticate_restful
@require_owner("trip", id_param="trip_id")
def list_vehicles(trip_id: str):
    vehicles = ShuttleService.list_for_trip(trip_id)
    return jsonify(ShuttleVehicleSchema(many=True).dump(vehicles)), HTTPStatus.OK


@shuttle_api.route("/<trip_id>/create", methods=["POST"])
@JWTService.authenticate_restful
@require_owner("trip", id_param="trip_id")
def create_vehicle(trip_id: str):
    try:
        vehicle = ShuttleService.create_vehicle(trip_id, request.get_json(silent=True) or {}, g.current_user_id)
        return jsonify(ShuttleVehicleSchema().dump(vehicle)), HTTPStatus.CREATED
    except ValidationError as e:
        abort(HTTPStatus.UNPROCESSABLE_ENTITY, description=e.messages)
    except NoResultFound as e:
        abort(HTTPStatus.NOT_FOUND, description=str(e))
    except ValueError as e:
        abort(HTTPStatus.BAD_REQUEST, description=str(e))
    except Exception as e:
        logger.error("shuttle_vehicle_create_error", extra={"error": str(e)})
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


@shuttle_api.route("/vehicle/<vehicle_id>", methods=["PATCH"])
@JWTService.authenticate_restful
@require_owner("shuttle_vehicle", id_param="vehicle_id")
def update_vehicle(vehicle_id: str):
    try:
        vehicle = ShuttleService.update_vehicle(vehicle_id, request.get_json(silent=True) or {}, g.current_user_id)
        return jsonify(ShuttleVehicleSchema().dump(vehicle)), HTTPStatus.OK
    except PermissionError as e:
        abort(HTTPStatus.FORBIDDEN, description=str(e))
    except ValueError as e:
        abort(HTTPStatus.FORBIDDEN, description=str(e))
    except NoResultFound as e:
        abort(HTTPStatus.NOT_FOUND, description=str(e))
    except ValidationError as e:
        abort(HTTPStatus.UNPROCESSABLE_ENTITY, description=e.messages)
    except Exception as e:
        logger.error("shuttle_vehicle_update_error", extra={"error": str(e)})
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


@shuttle_api.route("/vehicle/<vehicle_id>", methods=["DELETE"])
@JWTService.authenticate_restful
@require_owner("shuttle_vehicle", id_param="vehicle_id")
def delete_vehicle(vehicle_id: str):
    try:
        ShuttleService.delete_vehicle(vehicle_id, g.current_user_id)
        return "", HTTPStatus.NO_CONTENT
    except PermissionError as e:
        abort(HTTPStatus.FORBIDDEN, description=str(e))
    except ValueError as e:
        abort(HTTPStatus.FORBIDDEN, description=str(e))
    except NoResultFound as e:
        abort(HTTPStatus.NOT_FOUND, description=str(e))
    except Exception as e:
        logger.error("shuttle_vehicle_delete_error", extra={"error": str(e)})
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


@shuttle_api.route("/vehicle/<vehicle_id>/passenger", methods=["POST"])
@JWTService.authenticate_restful
@require_owner("shuttle_vehicle", id_param="vehicle_id")
def add_passenger(vehicle_id: str):
    data = request.get_json(silent=True) or {}
    member_id = data.get("tripMemberId")
    if not member_id:
        abort(HTTPStatus.BAD_REQUEST, description="tripMemberId is required")
    try:
        passenger = ShuttleService.add_passenger(vehicle_id, member_id, g.current_user_id)
        return jsonify(ShuttlePassengerSchema().dump(passenger)), HTTPStatus.CREATED
    except PermissionError as e:
        abort(HTTPStatus.FORBIDDEN, description=str(e))
    except ValueError as e:
        abort(HTTPStatus.BAD_REQUEST, description=str(e))
    except NoResultFound as e:
        abort(HTTPStatus.NOT_FOUND, description=str(e))
    except Exception as e:
        logger.error("shuttle_passenger_add_error", extra={"error": str(e)})
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


@shuttle_api.route("/vehicle/<vehicle_id>/passenger/<member_id>", methods=["DELETE"])
@JWTService.authenticate_restful
@require_owner("shuttle_vehicle", id_param="vehicle_id")
def remove_passenger(vehicle_id: str, member_id: str):
    try:
        ShuttleService.remove_passenger(vehicle_id, member_id, g.current_user_id)
        return "", HTTPStatus.NO_CONTENT
    except PermissionError as e:
        abort(HTTPStatus.FORBIDDEN, description=str(e))
    except ValueError as e:
        abort(HTTPStatus.FORBIDDEN, description=str(e))
    except NoResultFound as e:
        abort(HTTPStatus.NOT_FOUND, description=str(e))
    except Exception as e:
        logger.error("shuttle_passenger_remove_error", extra={"error": str(e)})
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))
