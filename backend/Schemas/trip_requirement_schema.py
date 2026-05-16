from marshmallow import fields, post_load, validates, ValidationError
from Models.trip_requirement import TripRequirement, RequirementStatusType
from Schemas.base_schema import BaseSchema


class TripRequirementSchema(BaseSchema):
    """Serialises and deserialises TripRequirement entities."""

    inventory_id = fields.UUID(load_only=True, required=False, allow_none=True)
    name = fields.String(required=True)
    category = fields.String(allow_none=True, load_default=None)
    catalog_item_id = fields.UUID(allow_none=True, load_default=None)
    covering_item_id = fields.UUID(allow_none=True, load_default=None)
    checked = fields.Boolean(load_default=False)
    status = fields.Enum(
        RequirementStatusType, by_value=True, load_default=RequirementStatusType.NEEDED
    )
    covering_item = fields.Nested('ItemSchema', dump_only=True, allow_none=True)
    contributors = fields.List(
        fields.Nested(
            'UserSchema',
            exclude=['pwd', 'trips', 'itineraries', 'inventories', 'items',
                     'endorsed_logs', 'logs'],
        ),
        attribute='contributor_users',
        dump_only=True,
        load_default=list,
    )

    @validates('name')
    def validate_name(self, value, **kwargs):
        if not value or not value.strip():
            raise ValidationError("Requirement name cannot be empty")
        if len(value) > 255:
            raise ValidationError("Requirement name cannot exceed 255 characters")

    @post_load
    def make_requirement(self, data, **kwargs):
        return TripRequirement(**data)
