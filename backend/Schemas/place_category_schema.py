from marshmallow import fields

from Schemas.base_schema import BaseSchema
from Models.place_category import PlaceCategory


class PlaceCategorySchema(BaseSchema):
    """Read-only from the client's perspective — categories are seeded, not authored
    (the create gate is closed until a future step)."""
    slug = fields.String(dump_only=True)
    name = fields.String(dump_only=True)
    icon = fields.String(dump_only=True)

    class Meta(BaseSchema.Meta):
        model = PlaceCategory
