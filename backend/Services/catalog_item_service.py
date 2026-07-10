"""
CatalogItem Service - Business logic for the per-user shared-requirement template.
"""
import logging
from typing import cast
from uuid import UUID
from sqlalchemy.exc import NoResultFound, IntegrityError

from Models.catalog_item import CatalogItem
from Models.item_category import ItemCategory
from Schemas.catalog_item_schema import CatalogItemSchema
from Api.database import db
from Api.seed import DEFAULT_TRIP_REQUIREMENTS
from Schemas.base_schema import camelcase

logger = logging.getLogger(__name__)

# Fields a client is permitted to change on an existing catalog item.
_MUTABLE_FIELDS = {"name", "category_id"}


class CatalogItemService:
    """Service class for CatalogItem-related business logic."""

    @staticmethod
    def get_items_by_owner(owner_id: str) -> list[CatalogItem]:
        """Return every catalog item template owned by the given user."""
        return (
            db.session.query(CatalogItem)
            .filter(CatalogItem.owner_id == UUID(str(owner_id)))
            .order_by(CatalogItem.name)
            .all()
        )

    @staticmethod
    def get_item_by_id(catalog_item_id: str) -> CatalogItem:
        """
        Retrieve a catalog item by its ID.

        Raises:
            NoResultFound: If the catalog item doesn't exist
        """
        item = db.session.get(CatalogItem, UUID(catalog_item_id))
        if not item:
            logger.warning(f"CatalogItem with id {catalog_item_id} not found")
            raise NoResultFound(f"CatalogItem {catalog_item_id} not found in database")
        return item

    @staticmethod
    def create_item(item_data: dict) -> CatalogItem:
        """
        Create a new catalog item.

        Raises:
            ValidationError: If data is invalid
            IntegrityError: If database constraints are violated
        """
        logger.info("Creating new catalog item")
        item = cast(CatalogItem, CatalogItemSchema().load(item_data))
        db.session.add(item)
        db.session.commit()
        db.session.refresh(item)
        logger.info(f"CatalogItem {item.id} created successfully")
        return item

    @staticmethod
    def update_item(catalog_item_id: str, item_data: dict) -> CatalogItem:
        """
        Update an existing catalog item.

        Only fields in _MUTABLE_FIELDS are applied — ownership (owner_id) and
        identity (id) fields are never overwritten by an update path.

        Raises:
            NoResultFound: If the catalog item doesn't exist
            IntegrityError: If database constraints are violated
        """
        item = CatalogItemService.get_item_by_id(catalog_item_id)

        logger.info(f"Updating catalog item {catalog_item_id}")
        for field in _MUTABLE_FIELDS:
            key = camelcase(field)
            if key in item_data:
                setattr(item, field, item_data[key])

        try:
            db.session.commit()
            db.session.refresh(item)
            logger.info(f"CatalogItem {catalog_item_id} updated successfully")
            return item
        except IntegrityError as e:
            db.session.rollback()
            logger.error(f"Integrity error updating catalog item {catalog_item_id}: {e}")
            raise

    @staticmethod
    def delete_item(catalog_item_id: str) -> None:
        """
        Delete a catalog item by its ID.

        Raises:
            NoResultFound: If the catalog item doesn't exist
            IntegrityError: If the item has references that prevent deletion
        """
        item = CatalogItemService.get_item_by_id(catalog_item_id)
        try:
            logger.info(f"Deleting catalog item {catalog_item_id}")
            db.session.delete(item)
            db.session.commit()
            logger.info(f"CatalogItem {catalog_item_id} deleted successfully")
        except IntegrityError as e:
            db.session.rollback()
            logger.error(f"Integrity error deleting catalog item {catalog_item_id}: {e}")
            raise IntegrityError(
                f"Cannot delete catalog item {catalog_item_id} due to existing references",
                params=None,
                orig=e,
            )

    @staticmethod
    def reset_to_default(owner_id: str) -> list[CatalogItem]:
        """
        Bootstrap the caller's empty template by copying DEFAULT_TRIP_REQUIREMENTS
        into owned CatalogItem rows — the on-ramp for a curator who wants to start
        from the known-good list and prune/extend it.

        Raises:
            ValueError: If the caller already has catalog items (avoids silent
                duplication — they must clear the template first to restart).
        """
        if CatalogItemService.get_items_by_owner(owner_id):
            raise ValueError("Catalog already has items; clear it before resetting to default")

        category_ids = {category.slug: category.id for category in db.session.query(ItemCategory).all()}
        items = [
            CatalogItem(
                owner_id=UUID(str(owner_id)),
                name=spec["name"],
                category_id=category_ids.get(spec["category"]),
            )
            for spec in DEFAULT_TRIP_REQUIREMENTS
        ]
        db.session.add_all(items)
        db.session.commit()
        for item in items:
            db.session.refresh(item)
        logger.info(f"CatalogItem template reset to default for owner {owner_id} ({len(items)} items)")
        return items
