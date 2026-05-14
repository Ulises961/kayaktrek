from marshmallow import fields, post_load

from Models.shuttle_passenger import ShuttlePassenger
from Schemas.base_schema import BaseSchema


class ShuttlePassengerSchema(BaseSchema):
    vehicle_id = fields.UUID(dump_only=True)
    trip_member_id = fields.UUID(required=True)

    @post_load
    def make_passenger(self, data, **kwargs):
        return ShuttlePassenger(**data)
