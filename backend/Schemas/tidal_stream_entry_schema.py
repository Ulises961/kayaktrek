from marshmallow import Schema, fields, post_load, validates, ValidationError
from Models.tidal_stream_entry import TidalStreamEntry


class TidalStreamEntrySchema(Schema):
    station_id = fields.UUID(allow_none=False, required=True)
    hours_from_hw = fields.Integer(allow_none=False, required=True)
    direction_degrees = fields.Float(allow_none=True, validate=lambda x: x is None or 0 <= x <= 360)
    spring_rate_knots = fields.Float(allow_none=True, validate=lambda x: x is None or x >= 0)
    neap_rate_knots = fields.Float(allow_none=True, validate=lambda x: x is None or x >= 0)

    @validates("hours_from_hw")
    def validate_hours_from_hw(self, value):
        if not (-6 <= value <= 6):
            raise ValidationError("hours_from_hw must be in the range -6 to +6")

    @post_load
    def make_entry(self, data, **kwargs):
        return TidalStreamEntry(**data)
