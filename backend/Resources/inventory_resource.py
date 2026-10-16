from http import HTTPStatus
import logging
from flask import Blueprint, jsonify, request, abort, g
from flask.typing import ResponseReturnValue
from sqlalchemy.exc import IntegrityError, NoResultFound

from Schemas.inventory_schema import InventorySchema
from Schemas.trip_requirement_schema import TripRequirementSchema
from Services.inventory_service import InventoryService
from Services.Middleware.auth_middleware import JWTService
from Services.Middleware.privileges_middleware import require_owner

logger = logging.getLogger(__name__)

INVENTORY_ENDPOINT = "/api/v1/inventory"
inventory_api = Blueprint('inventory', __name__, url_prefix=INVENTORY_ENDPOINT)

@inventory_api.route("/all", methods=["GET"])
@JWTService.authenticate_restful
def get_all_inventories() -> ResponseReturnValue:
    """
    GET /api/inventory/all - Retrieve all inventories for current user
    ---
    get:
      summary: List all inventories owned by the current user
      responses:
        200:
          description: The user's inventories
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/InventorySchema'
    """
    logger.info("Retrieve all inventories from db")
    user_id = g.current_user_id
    inventories = InventoryService.get_inventories_by_user(user_id)
    return jsonify([InventorySchema().dump(inventory) for inventory in inventories]), HTTPStatus.OK

@inventory_api.route("/<string:id>", methods=["GET"])
@JWTService.authenticate_restful
@require_owner('inventory')
def get_inventory(id: str) -> ResponseReturnValue:
    """
    GET /api/inventory/<id> - Retrieve inventory by ID
    ---
    get:
      summary: Get an inventory by id
      responses:
        200:
          description: The inventory, including its requirements
          content:
            application/json:
              schema: InventorySchema
        404:
          description: Inventory not found
    """
    try:
        logger.info(f"Retrieve inventory with id {id}")
        inventory = InventoryService.get_inventory_by_id(id)
        return jsonify(InventorySchema().dump(inventory)), HTTPStatus.OK
    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description=f"Inventory with id {id} not found")

@inventory_api.route("/create", methods=["POST"])
@JWTService.authenticate_restful
def create_inventory() -> ResponseReturnValue:
    """
    POST /api/inventory/create - Create new inventory
    ---
    post:
      summary: Create an inventory
      description: >
        A personal inventory is stamped with the caller as owner. A trip inventory
        (trip_id present) is owned by the trip instead.
      requestBody:
        content:
          application/json:
            schema: InventorySchema
      responses:
        201:
          description: The created inventory
          content:
            application/json:
              schema: InventorySchema
        409:
          description: Database integrity constraint violated
    """
    try:
        inventory_data = request.get_json()
        inventory = InventoryService.create_inventory(inventory_data)
        return jsonify(InventorySchema().dump(inventory)), HTTPStatus.CREATED
        
    except IntegrityError:
        abort(HTTPStatus.CONFLICT, description="Database integrity constraint violated")

@inventory_api.route("/<string:id>", methods=["PATCH"])
@JWTService.authenticate_restful
@require_owner('inventory')
def update_inventory(id: str) -> ResponseReturnValue:
    """
    PATCH /api/inventory/<id> — Partially update an existing inventory.

    Accepts a JSON body with any subset of mutable inventory fields.
    Only the fields present in the body are applied; omitted fields are left unchanged.

    Returns:
        200 with the updated inventory object, or 404 if not found.
    ---
    patch:
      summary: Update an inventory
      description: >
        Inventory has no user-editable scalar fields today — trip_id/user_id are set
        at creation and requirements are managed via their own endpoints — so this
        currently returns the record unchanged. Kept for API symmetry and future fields.
      requestBody:
        content:
          application/json:
            schema: InventorySchema
      responses:
        200:
          description: The inventory, unchanged
          content:
            application/json:
              schema: InventorySchema
        404:
          description: Inventory not found
        409:
          description: Database integrity constraint violated
    """
    try:
        logger.info(f"Update inventory {id} in db")
        inventory_data = request.get_json()
        inventory = InventoryService.update_inventory(id, inventory_data)
        return jsonify(InventorySchema().dump(inventory)), HTTPStatus.OK
        
    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description=f"Inventory with id {id} not found")
    except IntegrityError:
        abort(HTTPStatus.CONFLICT, description="Database integrity constraint violated")

@inventory_api.route("/<string:id>", methods=["DELETE"])
@JWTService.authenticate_restful
@require_owner('inventory')
def delete_inventory(id: str) -> ResponseReturnValue:
    """
    DELETE /api/inventory/<id> - Delete inventory by ID
    ---
    delete:
      summary: Delete an inventory
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
          description: Inventory not found
        409:
          description: Cannot delete inventory due to existing references
    """
    try:
        logger.info(f"Deleting inventory {id}")
        InventoryService.delete_inventory(id)
        return jsonify({"message": "Deletion successful"}), HTTPStatus.OK
        
    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description=f"Inventory with id {id} not found")
    except IntegrityError:
        abort(HTTPStatus.CONFLICT, description="Cannot delete inventory due to existing references")


@inventory_api.route("/<string:id>/requirements", methods=["POST"])
@JWTService.authenticate_restful
@require_owner('inventory')
def add_requirement(id: str) -> ResponseReturnValue:
    """
    POST /api/inventory/<id>/requirements — Add a requirement to the inventory.
    ---
    post:
      summary: Add a requirement to an inventory
      description: The caller is stamped as the proposer of the requirement.
      requestBody:
        content:
          application/json:
            schema: TripRequirementSchema
      responses:
        201:
          description: The created requirement
          content:
            application/json:
              schema: TripRequirementSchema
        404:
          description: Inventory not found
    """
    try:
        req = InventoryService.add_requirement(id, request.get_json())
        return jsonify(TripRequirementSchema().dump(req)), HTTPStatus.CREATED
    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description=f"Inventory {id} not found")


@inventory_api.route("/<string:id>/requirements/<string:req_id>", methods=["DELETE"])
@JWTService.authenticate_restful
@require_owner('inventory')
def remove_requirement(id: str, req_id: str) -> ResponseReturnValue:
    """
    DELETE /api/inventory/<id>/requirements/<req_id> — Remove a requirement.
    ---
    delete:
      summary: Remove a requirement from an inventory
      description: >
        Authorship-scoped — only the member who proposed the requirement may remove
        it (no leader override).
      responses:
        200:
          description: Removal confirmation
          content:
            application/json:
              schema:
                type: object
                properties:
                  message:
                    type: string
        403:
          description: Caller did not propose this requirement
        404:
          description: Requirement not found
    """
    try:
        InventoryService.remove_requirement(id, req_id)
        return jsonify({"message": "Requirement removed"}), HTTPStatus.OK
    except PermissionError as e:
        abort(HTTPStatus.FORBIDDEN, description=str(e))
    except NoResultFound:
        abort(HTTPStatus.NOT_FOUND, description=f"Requirement {req_id} not found")


@inventory_api.route(
    "/<string:id>/requirements/<string:req_id>/contribute", methods=["POST"]
)
@JWTService.authenticate_restful
@require_owner('inventory')
@require_owner('item', id_param='itemId', from_body=True)
def contribute_item(id: str, req_id: str) -> ResponseReturnValue:
    """
    POST /api/inventory/<id>/requirements/<req_id>/contribute
    Body: {"itemId": "<uuid>"}
    Covers the requirement with the caller's personal item.
    ---
    post:
      summary: Contribute a personal item to cover a requirement
      requestBody:
        content:
          application/json:
            schema:
              type: object
              required: [itemId]
              properties:
                itemId:
                  type: string
                  format: uuid
      responses:
        200:
          description: The updated requirement, now covered by this contribution
          content:
            application/json:
              schema: TripRequirementSchema
        400:
          description: itemId is missing, or the item cannot cover this requirement
        404:
          description: Inventory, requirement, or item not found
    """
    try:
        body = request.get_json()
        item_id = body.get("itemId")
        if not item_id:
            abort(HTTPStatus.BAD_REQUEST, description="itemId is required")
        req = InventoryService.contribute_item(id, req_id, item_id)
        return jsonify(TripRequirementSchema().dump(req)), HTTPStatus.OK
    except NoResultFound as e:
        abort(HTTPStatus.NOT_FOUND, description=str(e))
    except ValueError as e:
        abort(HTTPStatus.BAD_REQUEST, description=str(e))


@inventory_api.route(
    "/<string:id>/requirements/<string:req_id>/contribute", methods=["DELETE"]
)
@JWTService.authenticate_restful
@require_owner('inventory')
def unclaim_requirement(id: str, req_id: str) -> ResponseReturnValue:
    """
    DELETE /api/inventory/<id>/requirements/<req_id>/contribute
    Removes the caller's contribution from the requirement.
    ---
    delete:
      summary: Remove the caller's contribution from a requirement
      responses:
        200:
          description: The updated requirement
          content:
            application/json:
              schema: TripRequirementSchema
        404:
          description: >
            Inventory or requirement not found, or the caller has no contribution
            to withdraw from this requirement
    """
    try:
        req = InventoryService.unclaim_requirement(id, req_id)
        return jsonify(TripRequirementSchema().dump(req)), HTTPStatus.OK
    except NoResultFound as e:
        abort(HTTPStatus.NOT_FOUND, description=str(e))
    except ValueError as e:
        abort(HTTPStatus.BAD_REQUEST, description=str(e))
