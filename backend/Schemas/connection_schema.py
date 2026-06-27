from marshmallow import fields

from Schemas.base_schema import BaseSchema
from Models.connection import ConnectionStatusType


class _ConnectionUserSchema(BaseSchema):
    """Shallow, privacy-safe projection of a connection's counterparty.

    Exposes only public-identity fields — never mail, phone, or any private data.
    """
    id = fields.UUID(dump_only=True)
    username = fields.String(dump_only=True)
    name = fields.String(dump_only=True)
    surname = fields.String(dump_only=True)
    avatar_url = fields.String(dump_only=True)


class ConnectionSchema(BaseSchema):
    """Serialises a buddy connection row.

    Both parties are dumped shallowly; the client derives the direction by comparing
    the authenticated user against `requester`/`addressee`. Serialisation only —
    creation is driven by the resource reading `addresseeUsername`/`addresseeId`.
    """
    status = fields.Enum(ConnectionStatusType, by_value=True, dump_only=True)
    created = fields.DateTime(dump_only=True)
    responded_at = fields.DateTime(dump_only=True, allow_none=True)
    requester = fields.Nested(_ConnectionUserSchema, dump_only=True)
    addressee = fields.Nested(_ConnectionUserSchema, dump_only=True)
