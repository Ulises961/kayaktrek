from http import HTTPStatus
import logging

from flask import Blueprint, jsonify, request, abort, g
from flask.typing import ResponseReturnValue
from marshmallow import ValidationError
from sqlalchemy.exc import NoResultFound

from Schemas.tidal_station_schema import (
    TidalDiamondCreateSchema,
    TidalDiamondEditSchema,
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
_edit_schema = TidalDiamondEditSchema()


@tidal_diamond_api.route('/api/v1/tidal-diamond/create', methods=['POST'])
@JWTService.authenticate_restful
@require_owner('itinerary', parent_resource=('itinerary', 'itineraryId'), from_body=True)
def create_diamond() -> ResponseReturnValue:
    """
    TidalDiamondResource POST method. Adds a user-created tidal diamond to an itinerary.

    `entry_mode` selects whether the hourly table is synthesised from peak inputs
    (`simple`, rule of thirds) or supplied verbatim (`atlas`).
    ---
    post:
      summary: Create a user tidal diamond
      requestBody:
        content:
          application/json:
            schema: TidalDiamondCreateSchema
      responses:
        201:
          description: The created diamond, dumped as a station
          content:
            application/json:
              schema: TidalStationSchema
        400:
          description: Missing itineraryId, or validation error
    """
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


@tidal_diamond_api.route('/api/v1/tidal-diamond/<string:id>', methods=['GET'])
@JWTService.authenticate_restful
@require_owner('tidal_diamond')
def get_diamond(id: str) -> ResponseReturnValue:
    """Raw editable view of a user diamond, for prefilling the edit form.
    ---
    get:
      summary: Get a user tidal diamond's raw edit view
      description: Carries the per-hour table plus reconstructed simple-mode peak inputs
        (null for atlas diamonds), for prefilling the edit form. The matching write path
        is the PATCH route, validated by TidalDiamondUpdateSchema.
      responses:
        200:
          description: The diamond's editable fields
          content:
            application/json:
              schema: TidalDiamondEditSchema
        404:
          description: Tidal diamond not found
    """
    try:
        view = TidalStationService.get_diamond_edit_view(id)
        return jsonify(_edit_schema.dump(view)), HTTPStatus.OK
    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description="Tidal diamond not found")


@tidal_diamond_api.route('/api/v1/tidal-diamond/<string:id>', methods=['PATCH'])
@JWTService.authenticate_restful
@require_owner('tidal_diamond')
def update_diamond(id: str) -> ResponseReturnValue:
    """
    TidalDiamondResource PATCH method. Partially updates a user tidal diamond.

    All fields optional; the service rebuilds the hourly table only when the entry mode
    or a stream input is present.
    ---
    patch:
      summary: Update a user tidal diamond
      requestBody:
        content:
          application/json:
            schema: TidalDiamondUpdateSchema
      responses:
        200:
          description: The updated diamond, dumped as a station
          content:
            application/json:
              schema: TidalStationSchema
        400:
          description: Validation error, or incomplete simple-mode input
        404:
          description: Tidal diamond not found
    """
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


@tidal_diamond_api.route('/api/v1/tidal-diamond/<string:id>', methods=['DELETE'])
@JWTService.authenticate_restful
@require_owner('tidal_diamond')
def delete_diamond(id: str) -> ResponseReturnValue:
    """
    TidalDiamondResource DELETE method. Deletes a user tidal diamond.
    ---
    delete:
      summary: Delete a user tidal diamond
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
          description: Tidal diamond not found
    """
    try:
        TidalStationService.delete(id)
        return jsonify({"message": "Tidal diamond deleted"}), HTTPStatus.OK
    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description="Tidal diamond not found")
