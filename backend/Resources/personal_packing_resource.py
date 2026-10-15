from http import HTTPStatus
import logging

from flask import Blueprint, jsonify, request, abort
from sqlalchemy.exc import NoResultFound

from Schemas.personal_packing_item_schema import PersonalPackingItemSchema
from Services.personal_packing_service import PersonalPackingService
from Services.Middleware.auth_middleware import JWTService

logger = logging.getLogger(__name__)

PACKING_ENDPOINT = "/api/v1/packing"
personal_packing_api = Blueprint('personal_packing', __name__, url_prefix=PACKING_ENDPOINT)


@personal_packing_api.route("/trip/<string:trip_id>", methods=["GET"])
@JWTService.authenticate_restful
def list_packing(trip_id: str):
    """GET /api/packing/trip/<trip_id> — the caller's own packing list for a trip.
    ---
    get:
      summary: List the caller's packing list for a trip
      responses:
        200:
          description: The caller's packing entries for the trip
          content:
            application/json:
              schema:
                type: array
                items: PersonalPackingItemSchema
        404:
          description: Trip not found
    """
    try:
        items = PersonalPackingService.list_for_trip(trip_id)
        return jsonify([PersonalPackingItemSchema().dump(i) for i in items]), HTTPStatus.OK
    except NoResultFound as e:
        abort(HTTPStatus.NOT_FOUND, description=str(e))


@personal_packing_api.route("/create", methods=["POST"])
@JWTService.authenticate_restful
def add_packing():
    """POST /api/packing/create — Body: {"tripId": "<uuid>", "itemId": "<uuid>"}.
    Adds one of the caller's owned items to their private packing list for the trip.
    ---
    post:
      summary: Add an owned item to the caller's packing list for a trip
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required: [tripId, itemId]
              properties:
                tripId:
                  type: string
                  format: uuid
                itemId:
                  type: string
                  format: uuid
      responses:
        201:
          description: The created packing entry
          content:
            application/json:
              schema: PersonalPackingItemSchema
        400:
          description: Missing tripId/itemId, or the item does not belong to the trip
        403:
          description: The item is not owned by the caller
        404:
          description: Trip or item not found
    """
    try:
        body = request.get_json() or {}
        trip_id = body.get("tripId")
        item_id = body.get("itemId")
        if not trip_id or not item_id:
            abort(HTTPStatus.BAD_REQUEST, description="tripId and itemId are required")
        entry = PersonalPackingService.add_item(trip_id, item_id)
        return jsonify(PersonalPackingItemSchema().dump(entry)), HTTPStatus.CREATED
    except PermissionError as e:
        abort(HTTPStatus.FORBIDDEN, description=str(e))
    except NoResultFound as e:
        abort(HTTPStatus.NOT_FOUND, description=str(e))
    except ValueError as e:
        abort(HTTPStatus.BAD_REQUEST, description=str(e))


@personal_packing_api.route("/<string:id>", methods=["PATCH"])
@JWTService.authenticate_restful
def update_packing(id: str):
    """PATCH /api/packing/<id> — Body: {"checked": bool}. Toggles packed state on the
    caller's own entry.
    ---
    patch:
      summary: Toggle the packed state of a packing entry
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required: [checked]
              properties:
                checked:
                  type: boolean
      responses:
        200:
          description: The updated packing entry
          content:
            application/json:
              schema: PersonalPackingItemSchema
        400:
          description: checked is missing or not a boolean
        403:
          description: The entry does not belong to the caller
        404:
          description: Packing entry not found
    """
    try:
        body = request.get_json() or {}
        checked = body.get("checked")
        if checked is None:
            abort(HTTPStatus.BAD_REQUEST, description="checked is required")
        if not isinstance(checked, bool):
            abort(HTTPStatus.BAD_REQUEST, description="checked must be a boolean")
        entry = PersonalPackingService.set_checked(id, checked)
        return jsonify(PersonalPackingItemSchema().dump(entry)), HTTPStatus.OK
    except PermissionError as e:
        abort(HTTPStatus.FORBIDDEN, description=str(e))
    except NoResultFound as e:
        abort(HTTPStatus.NOT_FOUND, description=str(e))


@personal_packing_api.route("/<string:id>", methods=["DELETE"])
@JWTService.authenticate_restful
def delete_packing(id: str):
    """DELETE /api/packing/<id> — Remove the caller's own packing entry.
    ---
    delete:
      summary: Remove a packing entry
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
          description: Packing entry not found
    """
    try:
        PersonalPackingService.remove(id)
        return jsonify({"message": "Packing item removed"}), HTTPStatus.OK
    except NoResultFound as e:
        abort(HTTPStatus.NOT_FOUND, description=str(e))
