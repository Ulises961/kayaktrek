from marshmallow import fields, post_load, pre_load, validates, validates_schema, ValidationError
from Models.trip import Trip, TripDifficultyType, TripOutcomeType, TripStateType
from Schemas.base_schema import BaseSchema, camelcase
from Schemas.itinerary_schema import ItinerarySchema
from Schemas.inventory_schema import InventorySchema
from Schemas.trip_member_schema import TripMemberSchema
import bleach


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
    state = fields.Enum(TripStateType, by_value=True, load_default=TripStateType.BUILDING)
    difficulty = fields.Enum(TripDifficultyType, by_value=True, allow_none=True, load_default=None)
    description = fields.String(allow_none=True)
    destination = fields.String(allow_none=True)
    date_from = fields.Date(allow_none=True)
    date_to = fields.Date(allow_none=True)
    is_paused = fields.Boolean(dump_only=True)
    paused_at = fields.Date(dump_only=True, allow_none=True)
    outcome = fields.Enum(TripOutcomeType, by_value=True, dump_only=True, allow_none=True)
    last_checkpoint_alert_at = fields.DateTime(dump_only=True, allow_none=True)
    timezone_name = fields.String(dump_only=True, allow_none=True)

    @pre_load
    def sanitize_text_fields(self, data, **kwargs):
        for key in ('destination', 'description'):
            if key in data and data[key] is not None:
                data[key] = bleach.clean(str(data[key]).strip(), tags=[], strip=True)
        return data

    @validates('destination')
    def validate_destination(self, value, **kwargs):
        if value is not None and len(value) > 255:
            raise ValidationError("Destination cannot exceed 255 characters")

    @validates('description')
    def validate_description(self, value, **kwargs):
        if value is not None and len(value) > 2000:
            raise ValidationError("Description cannot exceed 2000 characters")

    @validates_schema
    def validate_dates(self, data, **kwargs):
        date_from = data.get('date_from')
        date_to = data.get('date_to')
        if date_from and date_to and date_to < date_from:
            raise ValidationError("date_to must be on or after date_from", field_name="date_to")

    @post_load
    def make_trip(self, data, **kwargs):
        return Trip(**data)


class TripUpdateSchema(TripSchema):
    """
    Schema for PATCH /api/trip/<id>.
    Validates scalar mutable fields only (destination, description, date_from, date_to).
    Nested objects (inventory, itinerary, travellers) are excluded from load;
    the resource handler merges validated scalars with the raw request.
    state excluded — use POST /api/trip/<id>/state.
    Returns a camelCase dict for the service layer.
    """
    state = fields.Enum(TripStateType, dump_only=True)
    inventory = fields.Nested('InventorySchema', dump_only=True)
    itinerary = fields.Nested('ItinerarySchema', dump_only=True)
    pending_travellers = fields.Nested('UserSchema', many=True, dump_only=True)

    @post_load
    def make_trip(self, data, **kwargs):
        return {camelcase(k): v for k, v in data.items()}
