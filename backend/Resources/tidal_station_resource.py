from http import HTTPStatus
import logging

from flask import Blueprint, jsonify, request, abort
from marshmallow import ValidationError
from sqlalchemy.exc import IntegrityError, NoResultFound
from werkzeug.exceptions import HTTPException

from Schemas.tidal_station_schema import TidalStationSchema, TidalStationUpdateSchema
from Services.Middleware.auth_middleware import JWTService
from Services.Middleware.privileges_middleware import require_admin
from Services.tidal_station_service import TidalStationService

logger = logging.getLogger(__name__)

tidal_station_api = Blueprint('tidal_station', __name__, url_prefix='/api/v1/tidal-station')


@tidal_station_api.route('/nearby', methods=['GET'])
def get_nearby_stations():
    """GET /api/tidal-station/nearby?lat=&lng=&range= — no auth required.
    ---
    get:
      summary: Find tidal stations near a point
      description: No auth required.
      parameters:
        - in: query
          name: lat
          required: true
          schema:
            type: number
          description: Latitude, between -90 and 90
        - in: query
          name: lng
          required: true
          schema:
            type: number
          description: Longitude, between -180 and 180
        - in: query
          name: range
          required: false
          schema:
            type: number
            default: 5.0
          description: Search radius in kilometres, between 0 and 100
      responses:
        200:
          description: Tidal stations within range, distance-ordered
          content:
            application/json:
              schema:
                type: array
                items: TidalStationSchema
        400:
          description: Missing or out-of-range lat/lng/range
    """
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

        stations = TidalStationService.get_nearby(lat, lng, range_km)
        return jsonify(TidalStationSchema(many=True).dump(stations)), HTTPStatus.OK
    except HTTPException:
        raise
    except Exception as e:
        logger.error("get_nearby_stations_error", extra={"error": str(e)})
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


@tidal_station_api.route('/create', methods=['POST'])
@JWTService.authenticate_restful
@require_admin()
def create_station():
    """
    TidalStationResource POST method. Creates an admin-curated reference tidal station.
    ---
    post:
      summary: Create a reference tidal station
      description: Admin-only. Distinct from user-created tidal diamonds (`/api/v1/tidal-diamond`).
      requestBody:
        content:
          application/json:
            schema: TidalStationSchema
      responses:
        201:
          description: The created station
          content:
            application/json:
              schema: TidalStationSchema
        400:
          description: Validation error
        409:
          description: Station already exists
    """
    try:
        body = request.get_json() or {}
        station = TidalStationSchema().load(body)
        created = TidalStationService.create(station)
        return jsonify(TidalStationSchema().dump(created)), HTTPStatus.CREATED
    except ValidationError as e:
        abort(HTTPStatus.BAD_REQUEST, description=e.messages)
    except IntegrityError:
        abort(HTTPStatus.CONFLICT, description="Station already exists")
    except HTTPException:
        raise
    except Exception as e:
        logger.error("create_station_error", extra={"error": str(e)})
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


@tidal_station_api.route('/<string:id>', methods=['PATCH'])
@JWTService.authenticate_restful
@require_admin()
def update_station(id: str):
    """
    TidalStationResource PATCH method. Updates a reference tidal station.
    ---
    patch:
      summary: Update a reference tidal station
      description: Admin-only.
      requestBody:
        content:
          application/json:
            schema: TidalStationUpdateSchema
      responses:
        200:
          description: The updated station
          content:
            application/json:
              schema: TidalStationSchema
        400:
          description: Validation error
        404:
          description: Station not found
    """
    try:
        body = request.get_json() or {}
        data = TidalStationUpdateSchema().load(body)
        station = TidalStationService.update(id, data)
        return jsonify(TidalStationSchema().dump(station)), HTTPStatus.OK
    except ValidationError as e:
        abort(HTTPStatus.BAD_REQUEST, description=e.messages)
    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description="Station not found")
    except HTTPException:
        raise
    except Exception as e:
        logger.error("update_station_error", extra={"station_id": id, "error": str(e)})
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


@tidal_station_api.route('/<string:id>', methods=['DELETE'])
@JWTService.authenticate_restful
@require_admin()
def delete_station(id: str):
    """
    TidalStationResource DELETE method. Deletes a reference tidal station.
    ---
    delete:
      summary: Delete a reference tidal station
      description: Admin-only.
      responses:
        200:
          description: Confirmation message
          content:
            application/json:
              schema:
                type: object
                properties:
                  message:
                    type: string
        404:
          description: Station not found
    """
    try:
        TidalStationService.delete(id)
        return jsonify({"message": "Station deleted"}), HTTPStatus.OK
    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description="Station not found")
    except HTTPException:
        raise
    except Exception as e:
        logger.error("delete_station_error", extra={"station_id": id, "error": str(e)})
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))
