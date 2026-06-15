from marshmallow import Schema, fields, post_load, validates, ValidationError, pre_load, EXCLUDE

from Models.sea_state import SeaState
from Schemas.base_schema import camelcase


class SeaStateSchema(Schema):

    class Meta:
        unknown = EXCLUDE

    day_id = fields.UUID(allow_none=True)
    time = fields.Time('%H:%M:%S', allow_none=True)
    wave_height = fields.Float(allow_none=False, required=True, validate=lambda x: 0 <= x <= 30)
    wave_direction = fields.Float(allow_none=False, required=True, validate=lambda x: 0 <= x <= 360)
    swell_wave_height = fields.Float(allow_none=True, validate=lambda x: x is None or 0 <= x <= 30)
    swell_direction = fields.Float(allow_none=True, validate=lambda x: x is None or 0 <= x <= 360)
    swell_period = fields.Float(allow_none=True, validate=lambda x: x is None or 0 <= x <= 30)
    current_speed = fields.Float(allow_none=True)
    current_direction = fields.Float(allow_none=True, validate=lambda x: x is None or 0 <= x <= 360)

    def on_bind_field(self, field_name, field_obj):
        field_obj.data_key = camelcase(field_obj.data_key or field_name)

    @pre_load
    def snake_to_camel_input(self, data, **kwargs):
        return {camelcase(k): v for k, v in data.items()}

    @validates('wave_height')
    def validate_wave_height(self, value, **kwargs):
        if value < 0:
            raise ValidationError("Wave height cannot be negative")
        if value > 30:
            raise ValidationError("Wave height cannot exceed 30 meters")

    @validates('wave_direction')
    def validate_wave_direction(self, value, **kwargs):
        if value < 0 or value > 360:
            raise ValidationError("Wave direction must be between 0 and 360 degrees")

    @validates('swell_direction')
    def validate_swell_direction(self, value, **kwargs):
        if value is not None and (value < 0 or value > 360):
            raise ValidationError("Swell direction must be between 0 and 360 degrees")

    @validates('swell_period')
    def validate_swell_period(self, value, **kwargs):
        if value is not None and value < 0:
            raise ValidationError("Swell period cannot be negative")
        if value is not None and value > 30:
            raise ValidationError("Swell period cannot exceed 30 seconds")

    @post_load
    def make_sea_state(self, data, **kwargs):
        return SeaState(**data)
