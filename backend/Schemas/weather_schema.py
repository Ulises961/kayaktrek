import bleach
import re
from marshmallow import Schema, fields, post_load, validates, ValidationError, pre_load, EXCLUDE

from Models.weather import Weather
from Schemas.base_schema import camelcase
from Schemas.weather_state_schema import WeatherStateSchema


class WeatherSchema(Schema):

    class Meta:
        unknown = EXCLUDE

    day_id = fields.UUID(allow_none=False, required=True)
    model = fields.String(allow_none=False, required=True, validate=lambda x: 1 <= len(x.strip()) <= 100)
    weather_states = fields.List(fields.Nested(WeatherStateSchema), allow_none=True, validate=lambda x: x is None or len(x) <= 24)

    def on_bind_field(self, field_name, field_obj):
        field_obj.data_key = camelcase(field_obj.data_key or field_name)

    @pre_load
    def snake_to_camel_input(self, data, **kwargs):
        return {camelcase(k): v for k, v in data.items()}

    @validates('model')
    def validate_model(self, value, **kwargs):
        if not value or not value.strip():
            raise ValidationError("Weather model cannot be empty")
        sanitized = bleach.clean(value.strip(), tags=[], strip=True)
        if len(sanitized) > 100:
            raise ValidationError("Weather model name cannot exceed 100 characters")
        if re.search(r'[<>"\';]', sanitized):
            raise ValidationError("Weather model contains invalid characters")

    @validates('weather_states')
    def validate_weather_states(self, value, **kwargs):
        if value is not None and len(value) > 24:
            raise ValidationError("Weather states cannot have more than 24 entries per day")

    @post_load
    def make_weather(self, data, **kwargs):
        return Weather(**data)
