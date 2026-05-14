import bleach
from marshmallow import fields, post_load, validates, ValidationError

from Schemas.base_schema import BaseSchema


class LogisticsSchema(BaseSchema):
    trip_id = fields.UUID(dump_only=True)
    shore_contact_name = fields.String(allow_none=True, load_default=None)
    shore_contact_email = fields.Email(allow_none=True, load_default=None)
    shore_contact_phone = fields.String(allow_none=True, load_default=None)
    shore_contact_relationship = fields.String(allow_none=True, load_default=None)
    shuttle_notes = fields.String(allow_none=True, load_default=None)
    shuttle_meeting_time = fields.String(allow_none=True, load_default=None)

    @validates("shore_contact_phone")
    def validate_phone(self, value, **kwargs):
        if value is not None and len(value) > 20:
            raise ValidationError("Phone number cannot exceed 20 characters")

    @post_load
    def sanitize(self, data, **kwargs):
        for field in ("shore_contact_name", "shore_contact_relationship",
                      "shuttle_notes", "shuttle_meeting_time"):
            if data.get(field):
                data[field] = bleach.clean(str(data[field]).strip(), tags=[], strip=True)
        return data
