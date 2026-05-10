from http import HTTPStatus

from flask import Blueprint, g, jsonify, request, abort
from marshmallow import ValidationError
from sqlalchemy.exc import NoResultFound
import logging

from Schemas.reservation_schema import ReservationSchema
from Services.reservation_service import ReservationService
from Services.Middleware.auth_middleware import JWTService
from Services.Middleware.privileges_middleware import require_owner

logger = logging.getLogger(__name__)

RESERVATION_ENDPOINT = "/api/reservation"
reservation_api = Blueprint("reservation", __name__, url_prefix=RESERVATION_ENDPOINT)


@reservation_api.route("/<trip_id>/all", methods=["GET"])
@JWTService.authenticate_restful
@require_owner("trip", id_param="trip_id")
def list_reservations(trip_id: str):
    reservations = ReservationService.list_for_trip(trip_id)
    return jsonify(ReservationSchema(many=True).dump(reservations)), HTTPStatus.OK


@reservation_api.route("/<trip_id>/create", methods=["POST"])
@JWTService.authenticate_restful
@require_owner("trip", id_param="trip_id")
def create_reservation(trip_id: str):
    try:
        reservation = ReservationService.create(trip_id, request.get_json(silent=True) or {}, g.current_user_id)
        return jsonify(ReservationSchema().dump(reservation)), HTTPStatus.CREATED
    except ValidationError as e:
        abort(HTTPStatus.UNPROCESSABLE_ENTITY, description=e.messages)
    except NoResultFound as e:
        abort(HTTPStatus.NOT_FOUND, description=str(e))
    except Exception as e:
        logger.error("reservation_create_error", extra={"error": str(e)})
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


@reservation_api.route("/<id>", methods=["PATCH"])
@JWTService.authenticate_restful
@require_owner("reservation")
def update_reservation(id: str):
    try:
        reservation = ReservationService.update(id, request.get_json(silent=True) or {}, g.current_user_id)
        return jsonify(ReservationSchema().dump(reservation)), HTTPStatus.OK
    except PermissionError as e:
        abort(HTTPStatus.FORBIDDEN, description=str(e))
    except ValueError as e:
        abort(HTTPStatus.FORBIDDEN, description=str(e))
    except NoResultFound as e:
        abort(HTTPStatus.NOT_FOUND, description=str(e))
    except ValidationError as e:
        abort(HTTPStatus.UNPROCESSABLE_ENTITY, description=e.messages)
    except Exception as e:
        logger.error("reservation_update_error", extra={"error": str(e)})
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


@reservation_api.route("/<id>", methods=["DELETE"])
@JWTService.authenticate_restful
@require_owner("reservation")
def delete_reservation(id: str):
    try:
        ReservationService.delete(id, g.current_user_id)
        return "", HTTPStatus.NO_CONTENT
    except PermissionError as e:
        abort(HTTPStatus.FORBIDDEN, description=str(e))
    except ValueError as e:
        abort(HTTPStatus.FORBIDDEN, description=str(e))
    except NoResultFound as e:
        abort(HTTPStatus.NOT_FOUND, description=str(e))
    except Exception as e:
        logger.error("reservation_delete_error", extra={"error": str(e)})
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))
