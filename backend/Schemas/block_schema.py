from marshmallow import fields

from Schemas.base_schema import BaseSchema


class _BlockedUserSchema(BaseSchema):
    """Shallow projection of a blocked paddler for the block-management list."""
    id = fields.UUID(dump_only=True)
    username = fields.String(dump_only=True)
    name = fields.String(dump_only=True)
    surname = fields.String(dump_only=True)
    avatar_url = fields.String(dump_only=True)


class BlockSchema(BaseSchema):
    """Serialises a block row. The blocker is always the caller, so only the blocked
    party is projected. Serialise-only — creation reads the body in the resource."""
    created = fields.DateTime(dump_only=True)
    blocked = fields.Nested(_BlockedUserSchema, dump_only=True)
