"""
Item Service - Business logic for item operations.
"""
import logging
from typing import cast
from uuid import UUID
from sqlalchemy.exc import NoResultFound, IntegrityError

from Models.item import Item
from Schemas.item_schema import ItemSchema
from Api.database import db
from Schemas.base_schema import camelcase

logger = logging.getLogger(__name__)

# Fields a client is permitted to change on an existing item.
_MUTABLE_FIELDS = {"name", "checked", "category_id"}


class ItemService:
    """Service class for Item-related business logic."""

    @staticmethod
    def get_item_by_id(item_id: str) -> Item:
        """
        Retrieve an item by its ID.

        Args:
            item_id: The ID of the item to retrieve

        Returns:
            Item object if found

        Raises:
            NoResultFound: If item doesn't exist
        """
        item = db.session.get(Item, UUID(item_id))
        if not item:
            logger.warning(f"Item with id {item_id} not found")
            raise NoResultFound(f"Item {item_id} not found in database")
        return item

    @staticmethod
    def create_item(item_data: dict) -> Item:
        """
        Create a new item.

        Args:
            item_data: Dictionary containing item information

        Returns:
            Created Item object

        Raises:
            ValidationError: If data is invalid
            IntegrityError: If database constraints are violated
        """
        logger.info("Creating new item")
        item_data.pop("inventoryId", None)  # auth middleware metadata, not item data
        item = cast(Item, ItemSchema().load(item_data))
        db.session.add(item)
        db.session.commit()
        db.session.refresh(item)
        logger.info(f"Item {item.id} created successfully")
        return item

    @staticmethod
    def update_item(item_id: str, item_data: dict) -> Item:
        """
        Update an existing item.

        Only fields in _MUTABLE_FIELDS are applied — ownership (user_id) and
        identity (id) fields are never overwritten by an update path.

        Args:
            item_id: The ID of the item to update
            item_data: Dictionary containing fields to update

        Returns:
            Updated Item object

        Raises:
            NoResultFound: If item doesn't exist
            IntegrityError: If database constraints are violated
        """
        item = ItemService.get_item_by_id(item_id)

        logger.info(f"Updating item {item_id}")
        for field in _MUTABLE_FIELDS:
            key = camelcase(field)
            if key in item_data:
                setattr(item, field, item_data[key])

        try:
            db.session.commit()
            db.session.refresh(item)
            logger.info(f"Item {item_id} updated successfully")
            return item
        except IntegrityError as e:
            db.session.rollback()
            logger.error(f"Integrity error updating item {item_id}: {e}")
            raise

    @staticmethod
    def delete_item(item_id: str) -> None:
        """
        Delete an item by its ID.

        Args:
            item_id: The ID of the item to delete

        Raises:
            NoResultFound: If item doesn't exist
            IntegrityError: If item has references that prevent deletion
        """
        item = ItemService.get_item_by_id(item_id)
        try:
            logger.info(f"Deleting item {item_id}")
            db.session.delete(item)
            db.session.commit()
            logger.info(f"Item {item_id} deleted successfully")
        except IntegrityError as e:
            db.session.rollback()
            logger.error(f"Integrity error deleting item {item_id}: {e}")
            raise IntegrityError(
                f"Cannot delete item {item_id} due to existing references",
                params=None,
                orig=e,
            )
