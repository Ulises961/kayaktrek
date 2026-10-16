from http import HTTPStatus
import logging
from flask import Blueprint, jsonify, request, abort, g
from marshmallow import ValidationError
from sqlalchemy.exc import IntegrityError, NoResultFound

from Schemas.catalog_item_schema import CatalogItemSchema
from Services.catalog_item_service import CatalogItemService
from Services.Middleware.auth_middleware import JWTService
from Services.Middleware.privileges_middleware import require_owner
from Api.database import db
logger = logging.getLogger(__name__)

CATALOG_ITEM_ENDPOINT = "/api/v1/catalog-item"
catalog_item_api = Blueprint('catalog_item', __name__, url_prefix=CATALOG_ITEM_ENDPOINT)


@catalog_item_api.route("/all", methods=["GET"])
@JWTService.authenticate_restful
def get_all_catalog_items():
    """GET /api/v1/catalog-item/all - Retrieve the caller's shared-requirement template.
    ---
    get:
      summary: List the current user's catalog item template
      responses:
        200:
          description: The user's catalog items
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/CatalogItemSchema'
    """
    items = CatalogItemService.get_items_by_owner(g.current_user_id)
    return jsonify([CatalogItemSchema().dump(item) for item in items]), HTTPStatus.OK


@catalog_item_api.route("/create", methods=["POST"])
@JWTService.authenticate_restful
def create_catalog_item():
    """POST /api/v1/catalog-item/create - Add an item to the caller's template.

    Catalog items are personal templates owned by the authenticated user
    (stamped from the auth context in CatalogItemSchema), so creation requires
    only a valid session.
    ---
    post:
      summary: Create a catalog item
      requestBody:
        content:
          application/json:
            schema: CatalogItemSchema
      responses:
        201:
          description: The created catalog item
          content:
            application/json:
              schema: CatalogItemSchema
        400:
          description: Invalid catalog item data
        409:
          description: Database integrity constraint violated
    """
    try:
        item_data = request.get_json()
        item = CatalogItemService.create_item(item_data)
        return jsonify(CatalogItemSchema().dump(item)), HTTPStatus.CREATED

    except ValidationError as e:
        abort(HTTPStatus.BAD_REQUEST, description=e.messages)
    except IntegrityError:
        abort(HTTPStatus.CONFLICT, description="Database integrity constraint violated")


@catalog_item_api.route("/reset-to-default", methods=["POST"])
@JWTService.authenticate_restful
def reset_catalog_to_default():
    """POST /api/v1/catalog-item/reset-to-default - Bootstrap the caller's empty
    template from DEFAULT_TRIP_REQUIREMENTS. 400 if the caller already has rows.
    ---
    post:
      summary: Reset the catalog template to the default requirement list
      responses:
        201:
          description: The newly seeded catalog items
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/CatalogItemSchema'
        400:
          description: Caller already has catalog items; clear the template before resetting
    """
    try:
        items = CatalogItemService.reset_to_default(g.current_user_id)
        return jsonify([CatalogItemSchema().dump(item) for item in items]), HTTPStatus.CREATED
    except ValueError as e:
        abort(HTTPStatus.BAD_REQUEST, description=str(e))


@catalog_item_api.route("/<string:id>", methods=["PATCH"])
@JWTService.authenticate_restful
@require_owner('catalog_item')
def update_catalog_item(id: str):
    """
    PATCH /api/v1/catalog-item/<id> — Partially update a catalog item.

    Accepts a JSON body with any subset of mutable fields: name, categoryId.
    Only the fields present in the body are applied; omitted fields are left
    unchanged. Ownership fields (ownerId) are never overwritten by this endpoint.
    ---
    patch:
      summary: Update a catalog item
      requestBody:
        content:
          application/json:
            schema: CatalogItemSchema
      responses:
        200:
          description: The updated catalog item
          content:
            application/json:
              schema: CatalogItemSchema
        404:
          description: Catalog item not found
        409:
          description: Database integrity constraint violated
    """
    try:
        logger.info(f"Update catalog item {id} in db")
        item_data = request.get_json()
        item = CatalogItemService.update_item(id, item_data)
        return jsonify(CatalogItemSchema().dump(item)), HTTPStatus.OK
    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description=f"Catalog item with id {id} not found")
    except IntegrityError:
        abort(HTTPStatus.CONFLICT, description="Database integrity constraint violated")


@catalog_item_api.route("/<string:id>", methods=["DELETE"])
@JWTService.authenticate_restful
@require_owner('catalog_item')
def delete_catalog_item(id: str):
    """DELETE /api/v1/catalog-item/<id> - Delete a catalog item by ID
    ---
    delete:
      summary: Delete a catalog item
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
          description: Catalog item not found
        409:
          description: Cannot delete catalog item due to existing references
    """
    try:
        logger.info(f"Deleting catalog item {id}")
        CatalogItemService.delete_item(id)
        return jsonify({"message": "Deletion successful"}), HTTPStatus.OK
    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description=f"Catalog item with id {id} not found")
    except IntegrityError:
        logger.error("Integrity error deleting catalog item")
        db.session.rollback()
        abort(HTTPStatus.CONFLICT, description="Cannot delete catalog item due to existing references")
