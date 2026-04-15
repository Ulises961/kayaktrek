from marshmallow import fields, post_load, validates, ValidationError
from Models.trip import Trip, TripStateType
from Schemas.base_schema import BaseSchema
from Schemas.itinerary_shema import ItinerarySchema
from Schemas.inventory_schema import InventorySchema
from Schemas.trip_member_schema import TripMemberSchema
import uuid


class TripSchema(BaseSchema):
    """
    Trip Schema — loading/dumping Trip entities.
    """
    inventory = fields.Nested(InventorySchema(exclude=['trip_id']), allow_none=True)
    itinerary = fields.Nested(ItinerarySchema(exclude=['trip_id']), allow_none=True)
    pending_travellers = fields.Nested(
        'UserSchema',
        exclude=['pwd', 'trips', 'itineraries', 'inventories', 'items',
                 'endorsed_logs', 'logs'],
        many=True,
        allow_none=True,
    )
    # Dump: serialise trip_members (includes role). Load: ignored — membership is
    # managed by TripService, not set through the schema.
    travellers = fields.Nested(
        TripMemberSchema,
        many=True,
        attribute="trip_members",
        dump_only=True,
    )
    state = fields.Enum(TripStateType, by_value=True, load_default=TripStateType.DRAFT)
    description = fields.String(allow_none=True)
    destination = fields.String(allow_none=True)
    date_from = fields.Date(allow_none=True)
    date_to = fields.Date(allow_none=True)

    @post_load
    def make_trip(self, data, **kwargs):
        return Trip(**data)
    
