from http import HTTPStatus
import logging

from flask import Blueprint, jsonify, request, abort, g
from flask.typing import ResponseReturnValue
from marshmallow import ValidationError
from sqlalchemy.exc import NoResultFound

from Schemas.wind_diamond_schema import WindDiamondSchema, WindDiamondUpdateSchema
from Services.Middleware.auth_middleware import JWTService
from Services.Middleware.privileges_middleware import require_owner
from Services.wind_diamond_service import WindDiamondService

logger = logging.getLogger(__name__)

# Wind diamonds — static hazard-reminder markers, itinerary-scoped. Any trip
# member may create/edit/delete (require_owner('wind_diamond') checks
# itinerary membership, no creator-only restriction — mirrors tidal diamonds).
wind_diamond_api = Blueprint('wind_diamond', __name__)

_create_schema = WindDiamondSchema()
_update_schema = WindDiamondUpdateSchema()
_dump_schema = WindDiamondSchema()


@wind_diamond_api.route('/api/v1/wind-diamond/create', methods=['POST'])
@JWTService.authenticate_restful
@require_owner('itinerary', parent_resource=('itinerary', 'itineraryId'), from_body=True)
def create_wind_diamond() -> ResponseReturnValue:
    """
    ---
    post:
      summary: Drop a wind-hazard reminder marker on the map
      description: >
        A static reminder that a place is known to originate or accelerate wind
        (e.g. katabatic/valley-drainage flow) — not forecast-driven, carries no
        rate/direction/intensity value. Creation is open to any trip member.
      requestBody:
        content:
          application/json:
            schema: WindDiamondSchema
      responses:
        201:
          description: The created wind diamond
          content:
            application/json:
              schema: WindDiamondSchema
        400:
          description: itineraryId is missing, or the body fails validation
    """
    try:
        body = request.get_json() or {}
        itinerary_id = body.get('itineraryId')
        if not itinerary_id:
            abort(HTTPStatus.BAD_REQUEST, description="itineraryId is required")
        data = _create_schema.load(body)
        diamond = WindDiamondService.create(itinerary_id, g.current_user_id, data)
        return jsonify(_dump_schema.dump(diamond)), HTTPStatus.CREATED
    except ValidationError as e:
        abort(HTTPStatus.BAD_REQUEST, description=e.messages)


@wind_diamond_api.route('/api/v1/wind-diamond/by-itinerary/<string:itinerary_id>', methods=['GET'])
@JWTService.authenticate_restful
@require_owner('itinerary', id_param='itinerary_id', read_only=True)
def list_wind_diamonds(itinerary_id: str) -> ResponseReturnValue:
    """All wind diamonds of an itinerary — the marker layer reads this.
    ---
    get:
      summary: List all wind diamonds of an itinerary
      responses:
        200:
          description: The itinerary's wind diamonds
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/WindDiamondSchema'
    """
    diamonds = WindDiamondService.list_by_itinerary(itinerary_id)
    return jsonify(_dump_schema.dump(diamonds, many=True)), HTTPStatus.OK


@wind_diamond_api.route('/api/v1/wind-diamond/<string:id>', methods=['GET'])
@JWTService.authenticate_restful
@require_owner('wind_diamond', read_only=True)
def get_wind_diamond(id: str) -> ResponseReturnValue:
    """
    ---
    get:
      summary: Get a wind diamond by id
      responses:
        200:
          description: The wind diamond
          content:
            application/json:
              schema: WindDiamondSchema
        404:
          description: Wind diamond not found
    """
    try:
        diamond = WindDiamondService.get_by_id(id)
        return jsonify(_dump_schema.dump(diamond)), HTTPStatus.OK
    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description="Wind diamond not found")


@wind_diamond_api.route('/api/v1/wind-diamond/<string:id>', methods=['PATCH'])
@JWTService.authenticate_restful
@require_owner('wind_diamond')
def update_wind_diamond(id: str) -> ResponseReturnValue:
    """
    ---
    patch:
      summary: Update a wind diamond
      description: Only whitelisted fields present in the body are applied.
      requestBody:
        content:
          application/json:
            schema: WindDiamondUpdateSchema
      responses:
        200:
          description: The updated wind diamond
          content:
            application/json:
              schema: WindDiamondSchema
        400:
          description: Validation error
        404:
          description: Wind diamond not found
    """
    try:
        body = request.get_json() or {}
        data = _update_schema.load(body, partial=True)
        diamond = WindDiamondService.update(id, data)
        return jsonify(_dump_schema.dump(diamond)), HTTPStatus.OK
    except ValidationError as e:
        abort(HTTPStatus.BAD_REQUEST, description=e.messages)
    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description="Wind diamond not found")


@wind_diamond_api.route('/api/v1/wind-diamond/<string:id>', methods=['DELETE'])
@JWTService.authenticate_restful
@require_owner('wind_diamond')
def delete_wind_diamond(id: str) -> ResponseReturnValue:
    """
    ---
    delete:
      summary: Delete a wind diamond
      responses:
        200:
          description: Deletion confirmation
          content:
            application/json:
              schema:
                type: object
                properties:
                  message:
                    type: string
        404:
          description: Wind diamond not found
    """
    try:
        WindDiamondService.delete(id)
        return jsonify({"message": "Wind diamond deleted"}), HTTPStatus.OK
    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description="Wind diamond not found")
