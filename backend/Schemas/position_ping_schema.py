from marshmallow import fields, validate

from Schemas.base_schema import BaseSchema


class PositionPingSchema(BaseSchema):
    """Validates an incoming GPS ping (M8 §D3) and serialises stored pings.

    trip_id/user_id are dump-only: the trip comes from the URL, the user from the
    JWT — never trusted from the request body."""

    trip_id = fields.UUID(dump_only=True)
    user_id = fields.UUID(dump_only=True)
    lat = fields.Float(required=True, validate=validate.Range(min=-90, max=90))
    lon = fields.Float(required=True, validate=validate.Range(min=-180, max=180))
    accuracy_m = fields.Float(allow_none=True, load_default=None, validate=validate.Range(min=0))
    heading_deg = fields.Float(
        allow_none=True, load_default=None, validate=validate.Range(min=0, max=360)
    )
    speed_ms = fields.Float(allow_none=True, load_default=None, validate=validate.Range(min=0))
    recorded_at = fields.DateTime(allow_none=True, load_default=None)
