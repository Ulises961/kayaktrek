"""ItemCategory Service — the seeded reference catalogue of gear categories."""
from Api.database import db
from Models.item_category import ItemCategory


class ItemCategoryService:
    """Service class for ItemCategory reads."""

    @staticmethod
    def get_all() -> list[ItemCategory]:
        """Every category, alphabetical by name."""
        return db.session.query(ItemCategory).order_by(ItemCategory.name).all()
