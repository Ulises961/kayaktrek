from http import HTTPStatus
import logging
from flask import Blueprint, jsonify, request, abort, g
from werkzeug.exceptions import HTTPException
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
    """GET /api/v1/catalog-item/all - Retrieve the caller's shared-requirement template."""
    try:
        items = CatalogItemService.get_items_by_owner(g.current_user_id)
        return jsonify([CatalogItemSchema().dump(item) for item in items]), HTTPStatus.OK

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving catalog items: {e}")
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


@catalog_item_api.route("/create", methods=["POST"])
@JWTService.authenticate_restful
def create_catalog_item():
    """POST /api/v1/catalog-item/create - Add an item to the caller's template.

    Catalog items are personal templates owned by the authenticated user
    (stamped from the auth context in CatalogItemSchema), so creation requires
    only a valid session.
    """
    try:
        item_data = request.get_json()
        item = CatalogItemService.create_item(item_data)
        return jsonify(CatalogItemSchema().dump(item)), HTTPStatus.CREATED

    except ValidationError as e:
        abort(HTTPStatus.BAD_REQUEST, description=e.messages)
    except HTTPException:
        raise
    except IntegrityError:
        abort(HTTPStatus.CONFLICT, description="Database integrity constraint violated")
    except Exception as e:
        logger.error(f"Error creating catalog item: {e}")
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


@catalog_item_api.route("/reset-to-default", methods=["POST"])
@JWTService.authenticate_restful
def reset_catalog_to_default():
    """POST /api/v1/catalog-item/reset-to-default - Bootstrap the caller's empty
    template from DEFAULT_TRIP_REQUIREMENTS. 400 if the caller already has rows.
    """
    try:
        items = CatalogItemService.reset_to_default(g.current_user_id)
        return jsonify([CatalogItemSchema().dump(item) for item in items]), HTTPStatus.CREATED

    except HTTPException:
        raise
    except ValueError as e:
        abort(HTTPStatus.BAD_REQUEST, description=str(e))
    except Exception as e:
        logger.error(f"Error resetting catalog to default: {e}")
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


@catalog_item_api.route("/<string:id>", methods=["PATCH"])
@JWTService.authenticate_restful
@require_owner('catalog_item')
def update_catalog_item(id: str):
    """
    PATCH /api/v1/catalog-item/<id> — Partially update a catalog item.

    Accepts a JSON body with any subset of mutable fields: name, categoryId.
    Only the fields present in the body are applied; omitted fields are left
    unchanged. Ownership fields (ownerId) are never overwritten by this endpoint.
    """
    try:
        logger.info(f"Update catalog item {id} in db")
        item_data = request.get_json()
        item = CatalogItemService.update_item(id, item_data)
        return jsonify(CatalogItemSchema().dump(item)), HTTPStatus.OK

    except HTTPException:
        raise
    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description=f"Catalog item with id {id} not found")
    except IntegrityError:
        abort(HTTPStatus.CONFLICT, description="Database integrity constraint violated")
    except Exception as e:
        logger.error(f"Error updating catalog item: {e}")
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


@catalog_item_api.route("/<string:id>", methods=["DELETE"])
@JWTService.authenticate_restful
@require_owner('catalog_item')
def delete_catalog_item(id: str):
    """DELETE /api/v1/catalog-item/<id> - Delete a catalog item by ID"""
    try:
        logger.info(f"Deleting catalog item {id}")
        CatalogItemService.delete_item(id)
        return jsonify({"message": "Deletion successful"}), HTTPStatus.OK

    except HTTPException:
        raise
    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description=f"Catalog item with id {id} not found")
    except IntegrityError:
        logger.error("Integrity error deleting catalog item")
        db.session.rollback()
        abort(HTTPStatus.CONFLICT, description="Cannot delete catalog item due to existing references")
    except Exception as e:
        logger.error(f"Error deleting catalog item: {e}")
        db.session.rollback()
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))
