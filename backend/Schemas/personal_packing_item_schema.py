from marshmallow import fields

from Schemas.base_schema import BaseSchema
from Schemas.item_schema import ItemSchema


class PersonalPackingItemSchema(BaseSchema):
    """Serialises a member's private packing entry.

    Construction is handled in the service (from tripId + itemId), so there is no
    post_load. `checked` is the only client-mutable field (via PATCH).
    """

    id = fields.UUID(dump_only=True)
    item = fields.Nested(ItemSchema, dump_only=True)
    checked = fields.Boolean(load_default=False)
