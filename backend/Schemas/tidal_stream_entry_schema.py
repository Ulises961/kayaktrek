from marshmallow import Schema, fields, validates, ValidationError, pre_load, post_load, EXCLUDE

from Models.tidal_stream_entry import TidalStreamEntry
from Schemas.base_schema import camelcase


class TidalStreamEntrySchema(Schema):
    """TidalStreamEntry schema.

    Composite PK (station_id, hours_from_hw) — does not extend BaseSchema.
    station_id is set by SQLAlchemy relationship cascade on creation; dump_only here.
    """

    class Meta:
        unknown = EXCLUDE

    station_id = fields.UUID(dump_only=True)
    hours_from_hw = fields.Integer(allow_none=False, required=True)
    direction_degrees = fields.Float(allow_none=True, load_default=None)
    spring_rate_knots = fields.Float(allow_none=True, load_default=None)
    neap_rate_knots = fields.Float(allow_none=True, load_default=None)

    def on_bind_field(self, field_name, field_obj):
        field_obj.data_key = camelcase(field_obj.data_key or field_name)

    @pre_load
    def snake_to_camel_input(self, data, **kwargs):
        return {camelcase(k): v for k, v in data.items()}

    @validates("hours_from_hw")
    def validate_hours_from_hw(self, value, **kwargs):
        if not (-6 <= value <= 6):
            raise ValidationError("hours_from_hw must be in the range -6 to +6")

    @validates("direction_degrees")
    def validate_direction(self, value, **kwargs):
        if value is not None and not (0 <= value <= 360):
            raise ValidationError("direction_degrees must be between 0 and 360")

    @validates("spring_rate_knots")
    def validate_spring_rate(self, value, **kwargs):
        if value is not None and value < 0:
            raise ValidationError("spring_rate_knots cannot be negative")

    @validates("neap_rate_knots")
    def validate_neap_rate(self, value, **kwargs):
        if value is not None and value < 0:
            raise ValidationError("neap_rate_knots cannot be negative")

    @post_load
    def make_entry(self, data, **kwargs):
        return TidalStreamEntry(**data)
