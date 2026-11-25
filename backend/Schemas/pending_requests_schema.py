from marshmallow import fields

from Schemas.base_schema import BaseSchema


class PendingRequestsSummarySchema(BaseSchema):
    """Serialise-only: the three counts behind the inbox badge."""

    trip_invitations = fields.Integer(dump_only=True)
    buddy_requests = fields.Integer(dump_only=True)
    endorsement_requests = fields.Integer(dump_only=True)
