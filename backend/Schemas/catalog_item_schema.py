from flask import g
from marshmallow import fields, post_load, pre_load, validates, ValidationError
from uuid import UUID
import bleach

from Models.catalog_item import CatalogItem
from Schemas.base_schema import BaseSchema
from Schemas.item_category_schema import ItemCategorySchema


class CatalogItemSchema(BaseSchema):
    """
    CatalogItem Schema
    used for loading/dumping CatalogItem entities.

    On load  : client sends categoryId (UUID) + name
    On dump  : category is serialised as {id, slug, name}; categoryId is write-only
    """
    # write-only: accepted from client, never returned in responses
    category_id = fields.UUID(load_only=True, allow_none=True)
    # read-only: full category object returned in responses
    category = fields.Nested(ItemCategorySchema, dump_only=True)

    name = fields.String(allow_none=False, required=True, validate=lambda x: 1 <= len(x.strip()) <= 255)
    # dump_only: stamped from auth context in @post_load, never accepted from client
    owner_id = fields.UUID(dump_only=True)

    @pre_load
    def sanitize_text_fields(self, data, **kwargs):
        if 'name' in data and data['name'] is not None:
            data['name'] = bleach.clean(str(data['name']).strip(), tags=[], strip=True)
        return data

    @validates('name')
    def validate_name(self, value, **kwargs):
        if not value or not value.strip():
            raise ValidationError("Catalog item name cannot be empty")
        if len(value) > 255:
            raise ValidationError("Catalog item name cannot exceed 255 characters")

    @post_load
    def make_catalog_item(self, data, **kwargs):
        data['owner_id'] = UUID(str(g.current_user_id))
        return CatalogItem(**data)
