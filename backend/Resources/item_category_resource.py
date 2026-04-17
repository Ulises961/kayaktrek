from http import HTTPStatus
import logging
from flask import Blueprint, jsonify, abort

from Models.item_category import ItemCategory
from Schemas.item_category_schema import ItemCategorySchema
from Api.database import db

logger = logging.getLogger(__name__)

ITEM_CATEGORY_ENDPOINT = "/api/item-categories"
item_category_api = Blueprint('item_category', __name__, url_prefix=ITEM_CATEGORY_ENDPOINT)


@item_category_api.route("", methods=["GET"])
def get_item_categories():
    """GET /api/item-categories — returns all categories (public, no auth required)."""
    try:
        categories = db.session.query(ItemCategory).order_by(ItemCategory.name).all()
        return jsonify(ItemCategorySchema(many=True).dump(categories)), HTTPStatus.OK
    except Exception as e:
        logger.error(f"Error retrieving item categories: {e}")
        abort(HTTPStatus.INTERNAL_SERVER_ERROR, description=str(e))
