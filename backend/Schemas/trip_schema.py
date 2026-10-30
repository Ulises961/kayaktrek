from flask import g
from marshmallow import fields, post_dump, post_load, pre_load, validates, validates_schema, ValidationError
from Models.difficulty import DifficultyType
from Models.trip import Trip, TripOutcomeType, TripStateType
from Schemas.base_schema import BaseSchema, camelcase
from Schemas.itinerary_schema import ItinerarySchema
from Schemas.inventory_schema import InventorySchema
from Schemas.trip_member_schema import TripMemberSchema
from Services.Utils.text_sanitizer import sanitize_text


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
    difficulty = fields.Enum(DifficultyType, by_value=True, allow_none=True, load_default=None)
    description = fields.String(allow_none=True)
    destination = fields.String(allow_none=True)
    date_from = fields.Date(allow_none=True)
    date_to = fields.Date(allow_none=True)
    is_paused = fields.Boolean(dump_only=True)
    paused_at = fields.Date(dump_only=True, allow_none=True)
    outcome = fields.Enum(TripOutcomeType, by_value=True, dump_only=True, allow_none=True)
    last_checkpoint_alert_at = fields.DateTime(dump_only=True, allow_none=True)
    timezone_name = fields.String(dump_only=True, allow_none=True)
    # Set by the single-trip read only: where the trip's change log stood when the data was
    # read. Absent from every other projection of a trip.
    change_rev = fields.Integer(dump_only=True, allow_none=True)

    @pre_load
    def sanitize_text_fields(self, data, **kwargs):
        for key in ('destination', 'description'):
            if key in data and data[key] is not None:
                data[key] = sanitize_text(data[key])
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

    @post_dump
    def hide_crewmates_consent_times(self, data, **kwargs):
        """Only the leader sees when another member shared their medical notes; everyone else
        sees their own and nobody else's. Done here, not in one endpoint, so every response
        that carries a trip's travellers applies it. With no signed-in caller nobody is the
        leader, so the times are hidden."""
        travellers = data.get("travellers") or []
        viewer_id = str(g.get("current_user_id") or "")
        viewer_is_leader = any(
            str(traveller.get("user", {}).get("id")) == viewer_id and traveller.get("role") == "leader"
            for traveller in travellers
        )
        if viewer_is_leader:
            return data
        for traveller in travellers:
            if str(traveller.get("user", {}).get("id")) != viewer_id:
                traveller["medicalNotesConsentAt"] = None
        return data

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

    def __init__(self, *args, stored_trip: Trip | None = None, **kwargs):
        super().__init__(*args, **kwargs)
        self.stored_trip = stored_trip

    @validates_schema
    def validate_dates(self, data, **kwargs):
        # A PATCH may carry one date only, so a date it omits is the one already stored.
        stored = self.stored_trip
        date_from = data['date_from'] if 'date_from' in data else stored and stored.date_from
        date_to = data['date_to'] if 'date_to' in data else stored and stored.date_to
        if date_from and date_to and date_to < date_from:
            raise ValidationError("date_to must be on or after date_from", field_name="date_to")

    @post_load
    def make_trip(self, data, **kwargs):
        return {camelcase(k): v for k, v in data.items()}
