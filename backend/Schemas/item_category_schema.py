from marshmallow import fields

from Schemas.base_schema import BaseSchema
from Models.item_category import ItemCategory


class ItemCategorySchema(BaseSchema):
    """Schema for ItemCategory — read-only from the client's perspective."""
    slug = fields.String(dump_only=True)
    name = fields.String(dump_only=True)

    class Meta(BaseSchema.Meta):
        model = ItemCategory
