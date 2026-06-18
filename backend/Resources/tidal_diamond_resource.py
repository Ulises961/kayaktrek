from http import HTTPStatus
import logging

from flask import Blueprint, jsonify, request, abort, g
from marshmallow import ValidationError
from sqlalchemy.exc import NoResultFound
from werkzeug.exceptions import HTTPException

from Schemas.tidal_station_schema import (
    TidalDiamondCreateSchema,
    TidalDiamondUpdateSchema,
    TidalStationSchema,
)
from Services.Middleware.auth_middleware import JWTService
from Services.Middleware.privileges_middleware import require_owner
from Services.tidal_station_service import TidalStationService

logger = logging.getLogger(__name__)

# User-created tidal diamonds. Itinerary-scoped on create; addressed by station id
# for patch/delete. Distinct from the admin-only /api/tidal-station routes.
tidal_diamond_api = Blueprint('tidal_diamond', __name__)

_create_schema = TidalDiamondCreateSchema()
_update_schema = TidalDiamondUpdateSchema()
_dump_schema = TidalStationSchema()


@tidal_diamond_api.route('/api/tidal-diamond/create', methods=['POST'])
@JWTService.authenticate_restful
@require_owner('itinerary', parent_resource=('itinerary', 'itineraryId'), from_body=True)
def create_diamond():
    try:
        body = request.get_json() or {}
        itinerary_id = body.get('itineraryId')
        if not itinerary_id:
            abort(HTTPStatus.BAD_REQUEST, description="itineraryId is required")
        data = _create_schema.load(body)
        station = TidalStationService.create_user_diamond(itinerary_id, g.current_user_id, data)
        return jsonify(_dump_schema.dump(station)), HTTPStatus.CREATED
    except ValidationError as e:
        abort(HTTPStatus.BAD_REQUEST, description=e.messages)
    except ValueError as e:
        abort(HTTPStatus.BAD_REQUEST, description=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error("create_diamond_error", extra={"error": str(e)})
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


@tidal_diamond_api.route('/api/tidal-diamond/<string:id>', methods=['PATCH'])
@JWTService.authenticate_restful
@require_owner('tidal_diamond')
def update_diamond(id: str):
    try:
        body = request.get_json() or {}
        data = _update_schema.load(body, partial=True)
        station = TidalStationService.update_user_diamond(id, data)
        return jsonify(_dump_schema.dump(station)), HTTPStatus.OK
    except ValidationError as e:
        abort(HTTPStatus.BAD_REQUEST, description=e.messages)
    except ValueError as e:
        abort(HTTPStatus.BAD_REQUEST, description=str(e))
    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description="Tidal diamond not found")
    except HTTPException:
        raise
    except Exception as e:
        logger.error("update_diamond_error", extra={"station_id": id, "error": str(e)})
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


@tidal_diamond_api.route('/api/tidal-diamond/<string:id>', methods=['DELETE'])
@JWTService.authenticate_restful
@require_owner('tidal_diamond')
def delete_diamond(id: str):
    try:
        TidalStationService.delete(id)
        return jsonify({"message": "Tidal diamond deleted"}), HTTPStatus.OK
    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description="Tidal diamond not found")
    except HTTPException:
        raise
    except Exception as e:
        logger.error("delete_diamond_error", extra={"station_id": id, "error": str(e)})
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))
