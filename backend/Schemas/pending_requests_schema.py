from marshmallow import fields

from Schemas.base_schema import BaseSchema


class PendingRequestsSummarySchema(BaseSchema):
    """Serialise-only: what is waiting on the caller, and the answers to their own requests they
    have not seen yet. Together they are the notification badge."""

    trip_invitations = fields.Integer(dump_only=True)
    buddy_requests = fields.Integer(dump_only=True)
    endorsement_requests = fields.Integer(dump_only=True)
    accepted_trip_invitations = fields.Integer(dump_only=True)
    accepted_buddy_requests = fields.Integer(dump_only=True)
