from http import HTTPStatus
import logging
from flask import Blueprint, jsonify, request, abort, g
from sqlalchemy.exc import IntegrityError, NoResultFound

from Schemas.item_schema import ItemSchema
from Services.item_service import ItemService
from Services.Middleware.auth_middleware import JWTService
from Services.Middleware.privileges_middleware import require_owner
logger = logging.getLogger(__name__)

ITEM_ENDPOINT = "/api/v1/item"
item_api = Blueprint('item', __name__, url_prefix=ITEM_ENDPOINT)

@item_api.route("/all", methods=["GET"])
@JWTService.authenticate_restful
def get_all_items():
    """GET /api/item/all - Retrieve all personal items owned by the current user.
    ---
    get:
      summary: List the current user's personal items
      responses:
        200:
          description: The user's personal items
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/ItemSchema'
    """
    items = ItemService.get_items_by_user(g.current_user_id)
    return jsonify([ItemSchema().dump(item) for item in items]), HTTPStatus.OK

@item_api.route("/<string:id>", methods=["GET"])
@JWTService.authenticate_restful
@require_owner('item')
def get_item(id: str):
    """GET /api/item/<id> - Retrieve item by ID
    ---
    get:
      summary: Get a personal item by id
      responses:
        200:
          description: The item
          content:
            application/json:
              schema: ItemSchema
        404:
          description: Item not found
    """
    try:
        item = ItemService.get_item_by_id(id)
        return jsonify(ItemSchema().dump(item)), HTTPStatus.OK
    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description=f"Item with id {id} not found")

@item_api.route("/create", methods=["POST"])
@JWTService.authenticate_restful
def create_item():
    """POST /api/item/create - Create a new personal item.

    Items are personal gear owned by the authenticated user (stamped from the
    auth context in ItemSchema), not scoped to any inventory — so creation
    requires only a valid session, no inventory ownership.
    ---
    post:
      summary: Create a personal item
      requestBody:
        content:
          application/json:
            schema: ItemSchema
      responses:
        201:
          description: The created item
          content:
            application/json:
              schema: ItemSchema
        409:
          description: Database integrity constraint violated
    """
    try:
        item_data = request.get_json()
        item = ItemService.create_item(item_data)
        return jsonify(ItemSchema().dump(item)), HTTPStatus.CREATED
    except IntegrityError:
        abort(HTTPStatus.CONFLICT, description="Database integrity constraint violated")

@item_api.route("/<string:id>", methods=["PATCH"])
@JWTService.authenticate_restful
@require_owner('item')
def update_item(id: str):
    """
    PATCH /api/item/<id> — Partially update an existing item.

    Accepts a JSON body with any subset of mutable item fields: name, checked, categoryId.
    Only the fields present in the body are applied; omitted fields are left unchanged.
    Ownership fields (userId) are never overwritten by this endpoint.

    Returns:
        200 with the updated item object, or 404 if not found.
    ---
    patch:
      summary: Update a personal item
      description: >
        Accepts any subset of name, checked, categoryId, status, defaultPack.
        Omitted fields are left unchanged; userId is never overwritten.
      requestBody:
        content:
          application/json:
            schema: ItemSchema
      responses:
        200:
          description: The updated item
          content:
            application/json:
              schema: ItemSchema
        404:
          description: Item not found
        409:
          description: Database integrity constraint violated
    """
    try:
        logger.info(f"Update item {id} in db")
        item_data = request.get_json()
        item = ItemService.update_item(id, item_data)
        return jsonify(ItemSchema().dump(item)), HTTPStatus.OK
    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description=f"Item with id {id} not found")
    except IntegrityError:
        abort(HTTPStatus.CONFLICT, description="Database integrity constraint violated")

@item_api.route("/<string:id>", methods=["DELETE"])
@JWTService.authenticate_restful
@require_owner('item')
def delete_item(id: str):
    """DELETE /api/item/<id> - Delete item by ID
    ---
    delete:
      summary: Delete a personal item
      responses:
        200:
          description: Deletion successful
          content:
            application/json:
              schema:
                type: object
                properties:
                  message:
                    type: string
        404:
          description: Item not found
        409:
          description: Cannot delete item due to existing references
    """
    try:
        logger.info(f"Deleting item {id}")
        ItemService.delete_item(id)
        return jsonify({"message": "Deletion successful"}), HTTPStatus.OK
    except IntegrityError as e:
        logger.error(f"Integrity error deleting item: {e}")
        abort(HTTPStatus.CONFLICT, description="Cannot delete item due to existing references")
