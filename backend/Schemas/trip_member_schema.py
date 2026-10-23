import bleach
from marshmallow import fields, post_load, pre_load
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

    medical_notes_consent_at = fields.DateTime(allow_none=True, dump_only=True)
    float_plan_confirmed_at = fields.DateTime(allow_none=True, dump_only=True)
    # Recorded by the leader, never through a member's own float-plan update.
    left_at = fields.DateTime(allow_none=True, dump_only=True)
    left_note = fields.String(allow_none=True, dump_only=True)
    nominated_successor = fields.Boolean(dump_only=True)
    # Changed through its own endpoint, never through a float-plan update.
    shares_satellite_position = fields.Boolean(dump_only=True)

    # Computed flags — never expose raw ciphertext in API responses
    has_trip_medical_notes = fields.Method("get_has_trip_medical_notes", dump_only=True)
    has_leader_medical_notes = fields.Method("get_has_leader_medical_notes", dump_only=True)

    def get_has_trip_medical_notes(self, obj):
        return obj.medical_notes_ciphertext is not None

    def get_has_leader_medical_notes(self, obj):
        return obj.medical_notes_leader_ciphertext is not None

    @post_load
    def make_trip_member(self, data, **kwargs):
        return TripMember(**data)


_MEMBER_TEXT_FIELDS = (
    "vesselMake", "vesselModel", "vesselColorPrimary", "vesselColorSecondary",
    "emergencyContactName", "emergencyContactPhone", "emergencyContactRelationship",
)


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

    @pre_load
    def sanitize_text_fields(self, data, **kwargs):
        for key in _MEMBER_TEXT_FIELDS:
            if data.get(key) is not None:
                data[key] = bleach.clean(str(data[key]).strip(), tags=[], strip=True)
        return data

    @post_load
    def to_dict(self, data, **kwargs):
        return {camelcase(k): v for k, v in data.items()}


class TripMemberSatelliteTrackingSchema(BaseSchema):
    """Load-only schema for PUT /api/trip/:id/member/me/satellite-tracking."""
    enabled = fields.Boolean(required=True)
