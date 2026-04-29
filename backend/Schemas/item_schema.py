from flask import g
from marshmallow import fields, post_load, validates, ValidationError
from uuid import UUID
import re

from Models.item import Item, ItemStatusType
from Schemas.base_schema import BaseSchema
from Schemas.item_category_schema import ItemCategorySchema


class ItemSchema(BaseSchema):
    """
    Item Schema
    used for loading/dumping Item entities.

    On load  : client sends categoryId (UUID) + name + checked + status
    On dump  : category is serialised as {id, slug, name}; categoryId is write-only
    """
    # write-only: accepted from client, never returned in responses
    category_id = fields.UUID(load_only=True, allow_none=True)
    # read-only: full category object returned in responses
    category = fields.Nested(ItemCategorySchema, dump_only=True)

    checked = fields.Boolean(allow_none=True)
    name = fields.String(allow_none=False, required=True, validate=lambda x: 1 <= len(x.strip()) <= 255)
    status = fields.Enum(ItemStatusType, by_value=True, allow_none=True, load_default=None)
    # dump_only: stamped from auth context in @post_load, never accepted from client
    user_id = fields.UUID(dump_only=True)

    @validates('name')
    def validate_name(self, value, **kwargs):
        if not value or not value.strip():
            raise ValidationError("Item name cannot be empty")
        if len(value) > 255:
            raise ValidationError("Item name cannot exceed 255 characters")
        if re.search(r'[<>"\';]', value):
            raise ValidationError("Item name contains invalid characters")

    @post_load
    def make_item(self, data, **kwargs):
        data['user_id'] = UUID(str(g.current_user_id))
        return Item(**data)
