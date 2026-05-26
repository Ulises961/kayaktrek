from marshmallow import Schema, fields, post_load, pre_load, validates, ValidationError
from Models.day import Day
from Schemas.base_schema import BaseSchema, camelcase
from Schemas.point_schema import PointSchema, PointPublicSchema
from Schemas.sea_schema import SeaSchema
from Schemas.weather_schema import WeatherSchema
from datetime import datetime, timedelta

class DaySchema(BaseSchema):
    """
    Day Schema
    used for loading/dumping Day entities
    """
    day_number = fields.Integer(allow_none=False, required=True, validate=lambda x: 1 <= x <= 365)
    itinerary_id = fields.UUID(allow_none=True)
    date = fields.Date('%Y-%m-%d', allow_none=True, required=False)
    start_point_id = fields.UUID(allow_none=True, dump_only=True)
    end_point_id = fields.UUID(allow_none=True, dump_only=True)
    points = fields.List(fields.Nested(PointSchema), allow_none=True, validate=lambda x: x is None or len(x) <= 100)
    sea = fields.Nested(SeaSchema, allow_none=True)
    weather = fields.Nested(WeatherSchema, allow_none=True)

    @validates('day_number')
    def validate_day_number(self, value,  **kwargs):
        """Validate day number is within reasonable range."""
        if value < 1:
            raise ValidationError("Day number must be at least 1")
        if value > 365:
            raise ValidationError("Day number cannot exceed 365")
    
    @validates('date')
    def validate_date(self, value,  **kwargs):
        """Validate date is not too far in the past or future."""
        if value:
            min_date = datetime.now().date() - timedelta(days=365*10)  # 10 years ago
            max_date = datetime.now().date() + timedelta(days=365*10)  # 10 years ahead
            if value < min_date:
                raise ValidationError("Date cannot be more than 10 years in the past")
            if value > max_date:
                raise ValidationError("Date cannot be more than 10 years in the future")
    
    @validates('points')
    def validate_points(self, value,  **kwargs):
        """Validate points list doesn't exceed reasonable limits."""
        if value is not None and len(value) > 100:
            raise ValidationError("A day cannot have more than 100 points")

    @post_load
    def make_day(self, data, **kwargs):
        return Day(**data)


class DayUpdateSchema(DaySchema):
    """
    Schema for PATCH /api/day/<id>.
    Validates scalar mutable fields only (day_number, date, start/end point IDs — all optional).
    Nested objects (weather, sea, points) are excluded from load;
    the resource handler merges validated scalars with the raw request.
    Returns a camelCase dict for the service layer.
    """
    day_number = fields.Integer(validate=lambda x: 1 <= x <= 365)
    date = fields.Date('%Y-%m-%d')
    itinerary_id = fields.UUID(dump_only=True)
    start_point_id = fields.UUID(allow_none=True)
    end_point_id = fields.UUID(allow_none=True)
    weather = fields.Nested('WeatherSchema', dump_only=True)
    sea = fields.Nested('SeaSchema', dump_only=True)
    points = fields.List(fields.Nested('PointSchema'), dump_only=True)

    @post_load
    def make_day(self, data, **kwargs):
        return {camelcase(k): v for k, v in data.items()}


class DayPublicSchema(BaseSchema):
    """Day fields safe for unauthenticated exposure."""
    day_number = fields.Integer(dump_only=True)
    date = fields.Date('%Y-%m-%d', dump_only=True, allow_none=True)
    start_point_id = fields.UUID(dump_only=True, allow_none=True)
    end_point_id = fields.UUID(dump_only=True, allow_none=True)
    points = fields.List(fields.Nested(PointPublicSchema), dump_only=True)