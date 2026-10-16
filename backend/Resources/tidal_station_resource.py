from http import HTTPStatus
import logging

from flask import Blueprint, jsonify, request, abort
from marshmallow import ValidationError
from sqlalchemy.exc import IntegrityError, NoResultFound

from Schemas.tidal_station_schema import TidalStationSchema, TidalStationUpdateSchema, TidalStationPositionSchema
from Services.Middleware.auth_middleware import JWTService
from Services.Middleware.privileges_middleware import require_admin, check_resource_ownership
from Services.tidal_station_service import TidalStationService

logger = logging.getLogger(__name__)

tidal_station_api = Blueprint('tidal_station', __name__, url_prefix='/api/v1/tidal-station')


def _may_see_full_content(station) -> bool:
    """Atlas-seeded stations (no owning itinerary) are public reference data.
    A user-created diamond's full content stays gated to the itinerary's own
    members — everyone else gets the position-only projection."""
    if station.itinerary_id is None:
        return True
    return bool(check_resource_ownership(
        resource_type="itinerary", resource_id=str(station.itinerary_id), read_only=True
    ))


@tidal_station_api.route('/nearby', methods=['GET'])
@JWTService.authenticate_restful
def get_nearby_stations():
    """GET /api/tidal-station/nearby?lat=&lng=&range=
    ---
    get:
      summary: Find tidal stations near a point
      description: >
        Full content (name/source/notes/hourly table) for atlas-seeded stations
        and the caller's own itinerary's diamonds; a position-only projection
        (M27) for other users' user-created diamonds.
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
    full_schema = TidalStationSchema()
    position_schema = TidalStationPositionSchema()
    payload = [
        full_schema.dump(station) if _may_see_full_content(station) else position_schema.dump(station)
        for station in stations
    ]
    return jsonify(payload), HTTPStatus.OK


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
