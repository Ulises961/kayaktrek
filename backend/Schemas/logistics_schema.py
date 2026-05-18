import bleach
from marshmallow import fields, post_load, pre_load, validates, ValidationError

from Schemas.base_schema import BaseSchema, camelcase

_SANITIZE_FIELDS = ("shoreContactName", "shoreContactRelationship",
                    "shuttleNotes", "shuttleMeetingTime")


class LogisticsSchema(BaseSchema):
    trip_id = fields.UUID(dump_only=True)
    shore_contact_name = fields.String(allow_none=True)
    shore_contact_email = fields.Email(allow_none=True)
    shore_contact_phone = fields.String(allow_none=True)
    shore_contact_relationship = fields.String(allow_none=True)
    shuttle_notes = fields.String(allow_none=True)
    shuttle_meeting_time = fields.String(allow_none=True)
    share_token = fields.String(dump_only=True, allow_none=True)
    snapshot_generated_at = fields.Method("get_snapshot_generated_at", dump_only=True)

    def get_snapshot_generated_at(self, obj):
        if obj.float_plan_snapshot:
            return obj.float_plan_snapshot.get("generatedAt")
        return None

    @pre_load
    def sanitize(self, data, **kwargs):
        for key in _SANITIZE_FIELDS:
            if data.get(key) is not None:
                data[key] = bleach.clean(str(data[key]).strip(), tags=[], strip=True)
        return data

    @validates("shore_contact_phone")
    def validate_phone(self, value, **kwargs):
        if value is not None and len(value) > 20:
            raise ValidationError("Phone number cannot exceed 20 characters")

    @post_load
    def to_camel(self, data, **kwargs):
        return {camelcase(k): v for k, v in data.items()}
