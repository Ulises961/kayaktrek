from http import HTTPStatus
import logging
from flask import Blueprint, jsonify, request, abort, g
from werkzeug.exceptions import HTTPException
from sqlalchemy.exc import IntegrityError, NoResultFound

from Schemas.inventory_schema import InventorySchema
from Schemas.trip_requirement_schema import TripRequirementSchema
from Services.inventory_service import InventoryService
from Services.Middleware.auth_middleware import JWTService
from Services.Middleware.privileges_middleware import require_owner

logger = logging.getLogger(__name__)

INVENTORY_ENDPOINT = "/api/inventory"
inventory_api = Blueprint('inventory', __name__, url_prefix=INVENTORY_ENDPOINT)

@inventory_api.route("/all", methods=["GET"])
@JWTService.authenticate_restful
def get_all_inventories():
    """GET /api/inventory/all - Retrieve all inventories for current user"""
    try:
        logger.info("Retrieve all inventories from db")
        user_id = g.current_user_id
        inventories = InventoryService.get_inventories_by_user(user_id)
        return jsonify([InventorySchema().dump(inventory) for inventory in inventories]), HTTPStatus.OK
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving inventories: {e}")
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))

@inventory_api.route("/<string:id>", methods=["GET"])
@JWTService.authenticate_restful
@require_owner('inventory')
def get_inventory(id: str):
    """GET /api/inventory/<id> - Retrieve inventory by ID"""
    try:
        logger.info(f"Retrieve inventory with id {id}")
        inventory = InventoryService.get_inventory_by_id(id)
        return jsonify(InventorySchema().dump(inventory)), HTTPStatus.OK
    
    except HTTPException:
        raise
    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description=f"Inventory with id {id} not found")
    except Exception as e:
        logger.error(f"Error retrieving inventory: {e}")
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))

@inventory_api.route("/create", methods=["POST"])
@JWTService.authenticate_restful
def create_inventory():
    """POST /api/inventory/create - Create new inventory"""
    try:
        inventory_data = request.get_json()
        inventory = InventoryService.create_inventory(inventory_data)
        return jsonify(InventorySchema().dump(inventory)), HTTPStatus.CREATED
        
    except HTTPException:
        raise
    except IntegrityError:
        abort(HTTPStatus.CONFLICT, description="Database integrity constraint violated")
    except Exception as e:
        logger.error(f"Error creating inventory: {e}")
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))

@inventory_api.route("/<string:id>/update", methods=["POST"])
@JWTService.authenticate_restful
@require_owner('inventory')
def update_inventory(id: str):
    """POST /api/inventory/<id>/update - Update existing inventory"""
    try:
        logger.info(f"Update inventory {id} in db")
        inventory_data = request.get_json()
        inventory = InventoryService.update_inventory(id, inventory_data)
        return jsonify(InventorySchema().dump(inventory)), HTTPStatus.OK
        
    except HTTPException:
        raise
    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description=f"Inventory with id {id} not found")
    except IntegrityError:
        abort(HTTPStatus.CONFLICT, description="Database integrity constraint violated")
    except Exception as e:
        logger.exception(f"Error updating inventory: {e}")
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))

@inventory_api.route("/<string:id>", methods=["DELETE"])
@JWTService.authenticate_restful
@require_owner('inventory')
def delete_inventory(id: str):
    """DELETE /api/inventory/<id> - Delete inventory by ID"""
    try:
        logger.info(f"Deleting inventory {id}")
        InventoryService.delete_inventory(id)
        return jsonify({"message": "Deletion successful"}), HTTPStatus.OK
        
    except HTTPException:
        raise
    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description=f"Inventory with id {id} not found")
    except IntegrityError:
        abort(HTTPStatus.CONFLICT, description="Cannot delete inventory due to existing references")
    except Exception as e:
        logger.error(f"Error deleting inventory: {e}")
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


@inventory_api.route("/<string:id>/requirements", methods=["POST"])
@JWTService.authenticate_restful
@require_owner('inventory')
def add_requirement(id: str):
    """POST /api/inventory/<id>/requirements — Add a requirement to the inventory."""
    try:
        req = InventoryService.add_requirement(id, request.get_json())
        return jsonify(TripRequirementSchema().dump(req)), HTTPStatus.CREATED
    except HTTPException:
        raise
    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description=f"Inventory {id} not found")
    except Exception as e:
        logger.error(f"Error adding requirement: {e}")
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


@inventory_api.route("/<string:id>/requirements/<string:req_id>", methods=["DELETE"])
@JWTService.authenticate_restful
@require_owner('inventory')
def remove_requirement(id: str, req_id: str):
    """DELETE /api/inventory/<id>/requirements/<req_id> — Remove a requirement."""
    try:
        InventoryService.remove_requirement(id, req_id)
        return jsonify({"message": "Requirement removed"}), HTTPStatus.OK
    except HTTPException:
        raise
    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description=f"Requirement {req_id} not found")
    except Exception as e:
        logger.error(f"Error removing requirement: {e}")
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


@inventory_api.route(
    "/<string:id>/requirements/<string:req_id>/contribute", methods=["POST"]
)
@JWTService.authenticate_restful
@require_owner('inventory')
@require_owner('item', id_param='itemId', from_body=True)
def contribute_item(id: str, req_id: str):
    """POST /api/inventory/<id>/requirements/<req_id>/contribute
    Body: {"itemId": "<uuid>"}
    Covers the requirement with the caller's personal item.
    """
    try:
        body = request.get_json()
        item_id = body.get("itemId")
        if not item_id:
            abort(HTTPStatus.BAD_REQUEST, description="itemId is required")
        req = InventoryService.contribute_item(id, req_id, item_id)
        return jsonify(TripRequirementSchema().dump(req)), HTTPStatus.OK
    except HTTPException:
        raise
    except NoResultFound as e:
        abort(HTTPStatus.NOT_FOUND, description=str(e))
    except ValueError as e:
        abort(HTTPStatus.BAD_REQUEST, description=str(e))
    except Exception as e:
        logger.error(f"Error contributing item: {e}")
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))


@inventory_api.route(
    "/<string:id>/requirements/<string:req_id>/contribute", methods=["DELETE"]
)
@JWTService.authenticate_restful
@require_owner('inventory')
def unclaim_requirement(id: str, req_id: str):
    """DELETE /api/inventory/<id>/requirements/<req_id>/contribute
    Removes the caller's contribution from the requirement.
    """
    try:
        req = InventoryService.unclaim_requirement(id, req_id)
        return jsonify(TripRequirementSchema().dump(req)), HTTPStatus.OK
    except HTTPException:
        raise
    except NoResultFound as e:
        abort(HTTPStatus.NOT_FOUND, description=str(e))
    except ValueError as e:
        abort(HTTPStatus.BAD_REQUEST, description=str(e))
    except Exception as e:
        logger.error(f"Error unclaiming requirement: {e}")
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))
