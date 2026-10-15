from http import HTTPStatus
import logging
from flask import Blueprint, jsonify

from Schemas.item_category_schema import ItemCategorySchema
from Services.item_category_service import ItemCategoryService

logger = logging.getLogger(__name__)

ITEM_CATEGORY_ENDPOINT = "/api/v1/item-categories"
item_category_api = Blueprint('item_category', __name__, url_prefix=ITEM_CATEGORY_ENDPOINT)


@item_category_api.route("", methods=["GET"])
def get_item_categories():
    """GET /api/item-categories — returns all categories (public, no auth required).
    ---
    get:
      summary: List item categories
      description: Seeded reference data — public, no auth required.
      responses:
        200:
          description: All item categories, alphabetical by name
          content:
            application/json:
              schema:
                type: array
                items: ItemCategorySchema
    """
    categories = ItemCategoryService.get_all()
    return jsonify(ItemCategorySchema(many=True).dump(categories)), HTTPStatus.OK
