import bleach
from marshmallow import fields, post_load, validates, ValidationError

from Models.shuttle_vehicle import ShuttleVehicle
from Schemas.base_schema import BaseSchema
from Schemas.shuttle_passenger_schema import ShuttlePassengerSchema


class ShuttleVehicleSchema(BaseSchema):
    trip_id = fields.UUID(dump_only=True)
    arranged_by_id = fields.UUID(dump_only=True)

    driver_id = fields.UUID(allow_none=True, load_default=None)
    driver_name = fields.String(allow_none=True, load_default=None)
    driver_contact = fields.String(allow_none=True, load_default=None)
    seats_available = fields.Integer(allow_none=True, load_default=None)
    kayak_spots = fields.Integer(allow_none=True, load_default=None)
    vehicle_description = fields.String(allow_none=True, load_default=None)
    pickup_point = fields.String(allow_none=True, load_default=None)

    passengers = fields.List(fields.Nested(ShuttlePassengerSchema), dump_only=True)

    @validates("seats_available")
    def validate_seats(self, value, **kwargs):
        if value is not None and value < 0:
            raise ValidationError("seats_available cannot be negative")

    @validates("kayak_spots")
    def validate_kayak_spots(self, value, **kwargs):
        if value is not None and value < 0:
            raise ValidationError("kayak_spots cannot be negative")

    @post_load
    def sanitize_and_make(self, data, **kwargs):
        for field in ("driver_name", "driver_contact", "vehicle_description", "pickup_point"):
            if data.get(field):
                data[field] = bleach.clean(str(data[field]).strip(), tags=[], strip=True)
        return ShuttleVehicle(**data)
