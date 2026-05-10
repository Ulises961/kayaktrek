from marshmallow import fields, post_load, validates, ValidationError

from Models.shuttle_assignment import ShuttleAssignment, ShuttleRole
from Schemas.base_schema import BaseSchema


class ShuttleAssignmentSchema(BaseSchema):
    logistics_id = fields.UUID(dump_only=True)
    trip_member_id = fields.UUID(required=True)
    role = fields.String(required=True)
    vehicle_description = fields.String(allow_none=True, load_default=None)
    pickup_point = fields.String(allow_none=True, load_default=None)

    @validates("role")
    def validate_role(self, value, **kwargs):
        valid = {r.value for r in ShuttleRole}
        if value not in valid:
            raise ValidationError(f"Role must be one of: {', '.join(valid)}")

    @post_load
    def make_assignment(self, data, **kwargs):
        data["role"] = ShuttleRole(data["role"])
        return ShuttleAssignment(**data)
