from flask import g
from marshmallow import fields, post_load, validates, ValidationError
import bleach

from Models.log import Log
from Schemas.base_schema import BaseSchema


class LogSchema(BaseSchema):
    hours = fields.Float(allow_none=True)
    avg_sea = fields.Integer(allow_none=True)
    distance = fields.Float(allow_none=True)
    date = fields.Date(allow_none=True)
    notes = fields.String(allow_none=True)
    user_id = fields.UUID(dump_only=True)

    @validates('hours')
    def validate_hours(self, value, **kwargs):
        if value is not None and not (0 <= value <= 24):
            raise ValidationError("Hours must be between 0 and 24")

    @validates('avg_sea')
    def validate_avg_sea(self, value, **kwargs):
        if value is not None:
            if not isinstance(value, int):
                raise ValidationError("Beaufort sea state must be a whole number")
            if not (0 <= value <= 12):
                raise ValidationError("Beaufort sea state must be between 0 and 12")

    @validates('distance')
    def validate_distance(self, value, **kwargs):
        if value is not None and value < 0:
            raise ValidationError("Distance cannot be negative")

    @validates('notes')
    def validate_notes(self, value, **kwargs):
        if value is not None:
            cleaned = bleach.clean(str(value).strip(), tags=[], strip=True)
            if len(cleaned) > 2000:
                raise ValidationError("Notes cannot exceed 2000 characters")

    @post_load
    def make_log(self, data, **kwargs):
        data["user_id"] = g.current_user_id
        return Log(**data)
