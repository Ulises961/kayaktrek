from marshmallow import fields

from Schemas.base_schema import BaseSchema
from Models.endorsement_request import EndorsementRequestStatusType


class _RequestUserSchema(BaseSchema):
    """Shallow projection of a request's counterparty."""
    id = fields.UUID(dump_only=True)
    username = fields.String(dump_only=True)
    name = fields.String(dump_only=True)
    surname = fields.String(dump_only=True)
    avatar_url = fields.String(dump_only=True)


class _RequestLogSchema(BaseSchema):
    """Shallow projection of the log an endorsement is being requested for."""
    id = fields.UUID(dump_only=True)
    date = fields.Date(dump_only=True, allow_none=True)
    distance = fields.Float(dump_only=True, allow_none=True)
    hours = fields.Float(dump_only=True, allow_none=True)
    trip_id = fields.UUID(dump_only=True, allow_none=True)


class EndorsementRequestSchema(BaseSchema):
    """Serialises an endorsement request for the inbox/outbox views. Serialise-only —
    creation reads the body in the resource."""
    status = fields.Enum(EndorsementRequestStatusType, by_value=True, dump_only=True)
    created = fields.DateTime(dump_only=True)
    responded_at = fields.DateTime(dump_only=True, allow_none=True)
    requester = fields.Nested(_RequestUserSchema, dump_only=True)
    addressee = fields.Nested(_RequestUserSchema, dump_only=True)
    log = fields.Nested(_RequestLogSchema, dump_only=True)
