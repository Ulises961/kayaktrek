from http import HTTPStatus
import logging

from flask import Blueprint, jsonify, request, abort, g
from marshmallow import ValidationError
from sqlalchemy.exc import IntegrityError, NoResultFound
from werkzeug.exceptions import HTTPException

from Schemas.place_schema import PlaceSchema, PlaceUpdateSchema
from Schemas.place_category_schema import PlaceCategorySchema, PlaceCategoryCreateSchema
from Services.Middleware.auth_middleware import JWTService
from Services.Middleware.privileges_middleware import require_admin, require_owner
from Services.place_service import PlaceService

logger = logging.getLogger(__name__)

# Map places — itinerary-scoped on create, addressed by id for read/patch/delete.
# Creation is open to any trip member; edit/delete is creator-only (enforced in the
# service, surfaced as 403 here).
place_api = Blueprint('place', __name__)

_create_schema = PlaceSchema()
_update_schema = PlaceUpdateSchema()
_dump_schema = PlaceSchema()
_category_schema = PlaceCategorySchema()
_category_create_schema = PlaceCategoryCreateSchema()


@place_api.route('/api/place-categories', methods=['GET'])
@JWTService.authenticate_restful
def get_place_categories():
    """The seeded catalogue of place kinds, for the create picker and marker icons."""
    try:
        categories = PlaceService.list_categories()
        return jsonify(_category_schema.dump(categories, many=True)), HTTPStatus.OK
    except HTTPException:
        raise
    except Exception as e:
        logger.error("get_place_categories_error", extra={"error": str(e)})
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


@place_api.route('/api/place-categories', methods=['POST'])
@JWTService.authenticate_restful
@require_admin()
def create_place_category():
    """Admin-only: extend the seeded place-category catalogue without a migration or a
    raw DB insert. A bridge tool — the public/community taxonomy is M7."""
    try:
        data = _category_create_schema.load(request.get_json() or {})
        category = PlaceService.create_category(data)
        return jsonify(_category_schema.dump(category)), HTTPStatus.CREATED
    except ValidationError as e:
        abort(HTTPStatus.BAD_REQUEST, description=e.messages)
    except IntegrityError:
        abort(HTTPStatus.CONFLICT, description="A category with that slug or name already exists")
    except HTTPException:
        raise
    except Exception as e:
        logger.error("create_place_category_error", extra={"error": str(e)})
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


@place_api.route('/api/place/create', methods=['POST'])
@JWTService.authenticate_restful
@require_owner('itinerary', parent_resource=('itinerary', 'itineraryId'), from_body=True)
def create_place():
    try:
        body = request.get_json() or {}
        itinerary_id = body.get('itineraryId')
        if not itinerary_id:
            abort(HTTPStatus.BAD_REQUEST, description="itineraryId is required")
        data = _create_schema.load(body)
        place = PlaceService.create(itinerary_id, g.current_user_id, data)
        return jsonify(_dump_schema.dump(place)), HTTPStatus.CREATED
    except ValidationError as e:
        abort(HTTPStatus.BAD_REQUEST, description=e.messages)
    except HTTPException:
        raise
    except Exception as e:
        logger.error("create_place_error", extra={"error": str(e)})
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


@place_api.route('/api/place/by-itinerary/<string:itinerary_id>', methods=['GET'])
@JWTService.authenticate_restful
@require_owner('itinerary', id_param='itinerary_id', read_only=True)
def list_places(itinerary_id: str):
    """All places of an itinerary — the marker layer reads this."""
    try:
        places = PlaceService.list_by_itinerary(itinerary_id)
        return jsonify(_dump_schema.dump(places, many=True)), HTTPStatus.OK
    except HTTPException:
        raise
    except Exception as e:
        logger.error("list_places_error", extra={"itinerary_id": itinerary_id, "error": str(e)})
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


@place_api.route('/api/place/by-itinerary/<string:itinerary_id>/range', methods=['GET'])
@JWTService.authenticate_restful
@require_owner('itinerary', id_param='itinerary_id', read_only=True)
def list_places_in_range(itinerary_id: str):
    """Places of an itinerary within range_km of (lat, lng), nearest first. The Place
    equivalent of the retired GET /api/point/pois."""
    try:
        lat = request.args.get('lat', type=float)
        lng = request.args.get('lng', type=float)
        range_km = request.args.get('range', default=5.0, type=float)
        if lat is None or lng is None:
            abort(HTTPStatus.BAD_REQUEST, description="lat and lng query parameters are required")
        if not (-90 <= lat <= 90) or not (-180 <= lng <= 180):
            abort(HTTPStatus.BAD_REQUEST, description="lat/lng out of range")
        if range_km <= 0 or range_km > 100:
            abort(HTTPStatus.BAD_REQUEST, description="range must be between 0 and 100 km")

        results = PlaceService.get_in_range(itinerary_id, range_km, lng, lat)
        payload = [
            {**_dump_schema.dump(row['place']), 'distanceKm': row['distance_km']}
            for row in results
        ]
        return jsonify(payload), HTTPStatus.OK
    except HTTPException:
        raise
    except Exception as e:
        logger.error("list_places_in_range_error", extra={"error": str(e)})
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


@place_api.route('/api/place/<string:id>', methods=['GET'])
@JWTService.authenticate_restful
@require_owner('place', read_only=True)
def get_place(id: str):
    try:
        place = PlaceService.get_by_id(id)
        return jsonify(_dump_schema.dump(place)), HTTPStatus.OK
    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description="Place not found")
    except HTTPException:
        raise
    except Exception as e:
        logger.error("get_place_error", extra={"place_id": id, "error": str(e)})
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


@place_api.route('/api/place/<string:id>', methods=['PATCH'])
@JWTService.authenticate_restful
@require_owner('place')
def update_place(id: str):
    try:
        body = request.get_json() or {}
        data = _update_schema.load(body, partial=True)
        place = PlaceService.update(id, g.current_user_id, data)
        return jsonify(_dump_schema.dump(place)), HTTPStatus.OK
    except ValidationError as e:
        abort(HTTPStatus.BAD_REQUEST, description=e.messages)
    except PermissionError as e:
        abort(HTTPStatus.FORBIDDEN, description=str(e))
    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description="Place not found")
    except HTTPException:
        raise
    except Exception as e:
        logger.error("update_place_error", extra={"place_id": id, "error": str(e)})
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


@place_api.route('/api/place/<string:id>', methods=['DELETE'])
@JWTService.authenticate_restful
@require_owner('place')
def delete_place(id: str):
    try:
        PlaceService.delete(id, g.current_user_id)
        return jsonify({"message": "Place deleted"}), HTTPStatus.OK
    except PermissionError as e:
        abort(HTTPStatus.FORBIDDEN, description=str(e))
    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description="Place not found")
    except HTTPException:
        raise
    except Exception as e:
        logger.error("delete_place_error", extra={"place_id": id, "error": str(e)})
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))
