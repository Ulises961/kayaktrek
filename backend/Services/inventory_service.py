"""
Inventory Service - Business logic for inventory operations.
"""

import logging
from typing import List, Optional, cast
from uuid import UUID
from flask import g
from sqlalchemy.exc import NoResultFound, IntegrityError

from Models.inventory import Inventory
from Models.trip_requirement import TripRequirement, RequirementStatusType
from Models.trip_member import TripMember
from Schemas.inventory_schema import InventorySchema
from Schemas.trip_requirement_schema import TripRequirementSchema
from Api.database import db
from Models.item import Item

logger = logging.getLogger(__name__)


class InventoryService:
    """Service class for Inventory-related business logic."""

    @staticmethod
    def get_inventory_by_id(inventory_id: str) -> Inventory:
        """
        Retrieve an inventory by its ID.

        Args:
            inventory_id: The ID of the inventory to retrieve

        Returns:
            Inventory object if found

        Raises:
            NoResultFound: If inventory doesn't exist
        """
        inventory = db.session.get(Inventory, UUID(inventory_id))
        if not inventory:
            logger.warning(f"Inventory with id {inventory_id} not found")
            raise NoResultFound(f"Inventory {inventory_id} not found in database")
        return inventory

    @staticmethod
    def _get_requirement(inventory_id: str, req_id: str) -> TripRequirement:
        req = db.session.query(TripRequirement).filter_by(
            id=UUID(req_id), inventory_id=UUID(inventory_id)
        ).first()
        if not req:
            raise NoResultFound(
                f"Requirement {req_id} not found in inventory {inventory_id}"
            )
        return req

    @staticmethod
    def _get_trip_member(
        inventory: Inventory, item_id: Optional[str] = None
    ) -> TripMember:
        """
        Resolve the TripMember for the current user in the trip that owns this
        inventory.  When item_id is provided the query also verifies that the
        current user owns that item — contribution and ownership are confirmed
        in a single round-trip.
        """
        if not inventory.trip_id:
            raise ValueError("This operation requires a trip-linked inventory")


        query = db.session.query(TripMember).filter(
            TripMember.user_id == UUID(g.current_user_id),
            TripMember.trip_id == inventory.trip_id,
        )

        if item_id is not None:
            query = query.join(Item, Item.user_id == TripMember.user_id).filter(
                Item.id == UUID(item_id)
            )

        member = query.first()
        if not member:
            raise NoResultFound(
                "Current user is not a member of this trip"
                + (" or does not own the specified item" if item_id else "")
            )
        return member

    @staticmethod
    def get_inventories_by_user(user_id: str) -> List[Inventory]:
        """
        Retrieve all inventories for a user.

        Args:
            user_id: The ID of the user

        Returns:
            List of Inventory objects

        Raises:
            NoResultFound: If no inventories exist
        """
        inventories = (
            db.session.query(Inventory)
            .filter(Inventory.user_id == UUID(user_id))
            .all()
        )
        logger.info(f"Found {len(inventories)} inventories for user {user_id}")
        return inventories

    @staticmethod
    def create_inventory(inventory_data: dict) -> Inventory:
        """
        Create a new inventory.

        Args:
            inventory_data: Dictionary containing inventory information

        Returns:
            Created Inventory object

        Raises:
            ValidationError: If data is invalid
            IntegrityError: If database constraints are violated
        """
        logger.info("Creating new inventory")
        inventory = cast(Inventory, InventorySchema().load(inventory_data))
        db.session.add(inventory)
        db.session.commit()
        db.session.refresh(inventory)
        logger.info(f"Inventory {inventory.id} created successfully")
        return inventory

    @staticmethod
    def update_inventory(inventory_id: str, inventory_data: dict) -> Inventory:
        """
        Update an existing inventory.

        Args:
            inventory_id: The ID of the inventory to update
            inventory_data: Dictionary containing inventory information

        Returns:
            Updated Inventory object

        Raises:
            ValidationError: If data is invalid
            NoResultFound: If inventory doesn't exist
            IntegrityError: If database constraints are violated
        """
        existing = InventoryService.get_inventory_by_id(inventory_id)
        logger.info(f"Updating inventory {inventory_id}")
        inventory_data.setdefault("user_id", str(existing.user_id))
        try:
            updated = cast(Inventory, InventorySchema().load(inventory_data))
            merged = cast(Inventory, db.session.merge(updated))
            db.session.commit()
            db.session.refresh(merged)
            logger.info(f"Inventory {inventory_id} updated successfully")
            return merged
        except IntegrityError as e:
            db.session.rollback()
            logger.exception(f"Integrity error updating inventory {inventory_id}: {e}")
            raise

    @staticmethod
    def delete_inventory(inventory_id: str) -> None:
        """
        Delete an inventory by its ID.

        Args:
            inventory_id: The ID of the inventory to delete

        Raises:
            NoResultFound: If inventory doesn't exist
            IntegrityError: If inventory has references that prevent deletion
        """
        inventory = InventoryService.get_inventory_by_id(inventory_id)
        try:
            logger.info(f"Deleting inventory {inventory_id}")
            db.session.delete(inventory)
            db.session.commit()
            logger.info(f"Inventory {inventory_id} deleted successfully")
        except IntegrityError as e:
            db.session.rollback()
            logger.error(f"Integrity error deleting inventory {inventory_id}: {e}")
            raise IntegrityError(
                f"Cannot delete inventory {inventory_id} due to existing references",
                params=None,
                orig=e,
            )

    # ------------------------------------------------------------------ #
    # Requirements                                                         #
    # ------------------------------------------------------------------ #

    @staticmethod
    def add_requirement(inventory_id: str, req_data: dict) -> TripRequirement:
        InventoryService.get_inventory_by_id(inventory_id)  # existence check
        req_data['inventory_id'] = inventory_id
        req = cast(TripRequirement, TripRequirementSchema().load(req_data))
        db.session.add(req)
        db.session.commit()
        db.session.refresh(req)
        logger.info(f"Requirement {req.id} added to inventory {inventory_id}")
        return req

    @staticmethod
    def remove_requirement(inventory_id: str, req_id: str) -> None:
        req = InventoryService._get_requirement(inventory_id, req_id)
        db.session.delete(req)
        db.session.commit()
        logger.info(f"Requirement {req_id} removed from inventory {inventory_id}")

    @staticmethod
    def contribute_item(inventory_id: str, req_id: str, item_id: str) -> TripRequirement:
        inventory = InventoryService.get_inventory_by_id(inventory_id)
        req = InventoryService._get_requirement(inventory_id, req_id)
        trip_member = InventoryService._get_trip_member(inventory)

        req.covering_item_id = UUID(item_id)
        if trip_member not in req.contributors:
            req.contributors.append(trip_member)
        req.status = RequirementStatusType.COVERED

        db.session.commit()
        db.session.refresh(req)
        logger.info(
            f"User {g.current_user_id} contributed item {item_id} "
            f"to requirement {req_id}"
        )
        return req

    @staticmethod
    def unclaim_requirement(inventory_id: str, req_id: str) -> TripRequirement:
        inventory = InventoryService.get_inventory_by_id(inventory_id)
        req = InventoryService._get_requirement(inventory_id, req_id)
        if (item_id := req.covering_item_id) is not None:
            trip_member = InventoryService._get_trip_member(inventory, str(item_id))
            if trip_member in req.contributors:
                req.contributors.remove(trip_member)

            if not req.contributors:
                req.covering_item_id = None
                req.status = RequirementStatusType.NEEDED

            db.session.commit()
            db.session.refresh(req)
            logger.info(
                f"User {g.current_user_id} unclaimed requirement {req_id}"
            )
        return req
