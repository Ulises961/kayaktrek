from marshmallow import fields, post_load, validates, ValidationError

from Models.reservation import Reservation, ReservationType
from Schemas.base_schema import BaseSchema


class ReservationSchema(BaseSchema):
    trip_id = fields.UUID(dump_only=True)
    owner_id = fields.UUID(dump_only=True)
    type = fields.String(required=True)
    name = fields.String(required=True)
    date = fields.Date(allow_none=True, load_default=None)
    confirmation_number = fields.String(allow_none=True, load_default=None)
    notes = fields.String(allow_none=True, load_default=None)
    url = fields.String(allow_none=True, load_default=None)

    @validates("type")
    def validate_type(self, value, **kwargs):
        valid = {t.value for t in ReservationType}
        if value not in valid:
            raise ValidationError(f"Type must be one of: {', '.join(valid)}")

    @validates("name")
    def validate_name(self, value, **kwargs):
        if not value or not value.strip():
            raise ValidationError("Name cannot be empty")

    @post_load
    def make_reservation(self, data, **kwargs):
        data["type"] = ReservationType(data["type"])
        return Reservation(**data)
