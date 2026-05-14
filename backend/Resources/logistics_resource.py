from http import HTTPStatus

from flask import Blueprint, g, jsonify, request, abort
from marshmallow import ValidationError
from sqlalchemy.exc import NoResultFound
import logging

from Schemas.logistics_schema import LogisticsSchema
from Services.logistics_service import LogisticsService
from Services.Middleware.auth_middleware import JWTService
from Services.Middleware.privileges_middleware import require_owner

logger = logging.getLogger(__name__)

LOGISTICS_ENDPOINT = "/api/logistics"
logistics_api = Blueprint("logistics", __name__, url_prefix=LOGISTICS_ENDPOINT)


@logistics_api.route("/<trip_id>", methods=["GET"])
@JWTService.authenticate_restful
@require_owner("trip", id_param="trip_id")
def get_logistics(trip_id: str):
    logistics = LogisticsService.get(trip_id)
    if not logistics:
        return jsonify({}), HTTPStatus.OK
    return jsonify(LogisticsSchema().dump(logistics)), HTTPStatus.OK


@logistics_api.route("/<trip_id>", methods=["PUT"])
@JWTService.authenticate_restful
@require_owner("trip", id_param="trip_id")
def upsert_logistics(trip_id: str):
    try:
        logistics = LogisticsService.upsert(trip_id, request.get_json(silent=True) or {}, g.current_user_id)
        return jsonify(LogisticsSchema().dump(logistics)), HTTPStatus.OK
    except PermissionError as e:
        abort(HTTPStatus.FORBIDDEN, description=str(e))
    except (NoResultFound, ValueError) as e:
        abort(HTTPStatus.BAD_REQUEST, description=str(e))
    except ValidationError as e:
        abort(HTTPStatus.UNPROCESSABLE_ENTITY, description=e.messages)
    except Exception as e:
        logger.error("logistics_upsert_error", extra={"error": str(e)})
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))
