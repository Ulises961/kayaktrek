from marshmallow import fields, post_load
from Models.trip_member import TripMember, MemberRoleType
from Schemas.base_schema import BaseSchema, camelcase


class TripMemberSchema(BaseSchema):
    """Serialises TripMember including float plan snapshot fields."""
    user_id = fields.UUID(load_only=True, required=False)
    trip_id = fields.UUID(load_only=True, required=False)
    role = fields.Enum(MemberRoleType, by_value=True, load_default=MemberRoleType.CREW)
    user = fields.Nested(
        'UserSchema',
        exclude=['pwd', 'trips', 'itineraries', 'inventories', 'items',
                 'endorsed_logs', 'logs'],
        dump_only=True,
    )

    vessel_make = fields.String(allow_none=True)
    vessel_model = fields.String(allow_none=True)
    vessel_length_cm = fields.Integer(allow_none=True)
    vessel_color_primary = fields.String(allow_none=True)
    vessel_color_secondary = fields.String(allow_none=True)

    emergency_contact_name = fields.String(allow_none=True)
    emergency_contact_phone = fields.String(allow_none=True)
    emergency_contact_relationship = fields.String(allow_none=True)

    # medical_notes: dump_only, only present for trip leader reads (enforced at service layer)
    medical_notes = fields.String(allow_none=True, dump_only=True)
    medical_notes_consent_at = fields.DateTime(allow_none=True, dump_only=True)
    float_plan_confirmed_at = fields.DateTime(allow_none=True, dump_only=True)

    @post_load
    def make_trip_member(self, data, **kwargs):
        return TripMember(**data)


class TripMemberUpdateSchema(BaseSchema):
    """Load-only schema for PATCH /api/trip/:id/member/me.
    All fields optional; role is excluded — members cannot change their own role.
    Medical notes are managed via dedicated consent endpoints."""
    vessel_make = fields.String(allow_none=True)
    vessel_model = fields.String(allow_none=True)
    vessel_length_cm = fields.Integer(allow_none=True)
    vessel_color_primary = fields.String(allow_none=True)
    vessel_color_secondary = fields.String(allow_none=True)
    emergency_contact_name = fields.String(allow_none=True)
    emergency_contact_phone = fields.String(allow_none=True)
    emergency_contact_relationship = fields.String(allow_none=True)

    @post_load
    def to_dict(self, data, **kwargs):
        return {camelcase(k): v for k, v in data.items()}
