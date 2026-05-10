from marshmallow import fields, validates, ValidationError

from Schemas.base_schema import BaseSchema
from Schemas.shuttle_assignment_schema import ShuttleAssignmentSchema


class LogisticsSchema(BaseSchema):
    trip_id = fields.UUID(dump_only=True)
    departure_point = fields.String(allow_none=True, load_default=None)
    arrival_point = fields.String(allow_none=True, load_default=None)
    travel_notes = fields.String(allow_none=True, load_default=None)
    shore_contact_name = fields.String(allow_none=True, load_default=None)
    shore_contact_email = fields.Email(allow_none=True, load_default=None)
    shore_contact_phone = fields.String(allow_none=True, load_default=None)
    shore_contact_relationship = fields.String(allow_none=True, load_default=None)
    shuttle_notes = fields.String(allow_none=True, load_default=None)
    shuttle_meeting_time = fields.String(allow_none=True, load_default=None)
    shuttle_assignments = fields.List(fields.Nested(ShuttleAssignmentSchema), dump_only=True)

    @validates("shore_contact_phone")
    def validate_phone(self, value, **kwargs):
        if value is not None and len(value) > 20:
            raise ValidationError("Phone number cannot exceed 20 characters")
