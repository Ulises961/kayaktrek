import bleach
from marshmallow import fields, post_load, pre_load, validates, ValidationError

from Models.trip_requirement import TripRequirement, RequirementStatusType
from Models.item import ItemStatusType
from Schemas.base_schema import BaseSchema

_SANITIZE_FIELDS = ("name", "category")


class _ShallowUserSchema(BaseSchema):
    """Minimal user shape — never leaks credentials or related collections."""
    id = fields.UUID(dump_only=True)
    username = fields.String(dump_only=True)
    name = fields.String(dump_only=True)


class _ShallowMemberSchema(BaseSchema):
    """A TripMember reduced to identity + its user. Deliberately excludes all the
    member's vessel / emergency / encrypted-medical fields."""
    id = fields.UUID(dump_only=True)
    user = fields.Nested(_ShallowUserSchema, dump_only=True)


class _ShallowItemSchema(BaseSchema):
    id = fields.UUID(dump_only=True)
    name = fields.String(dump_only=True)
    status = fields.Enum(ItemStatusType, by_value=True, dump_only=True)


class _ContributionSchema(BaseSchema):
    """One member bringing one item to cover the requirement."""
    id = fields.UUID(dump_only=True)
    member = fields.Nested(_ShallowMemberSchema, dump_only=True)
    item = fields.Nested(_ShallowItemSchema, dump_only=True)
    checked = fields.Boolean(dump_only=True)


class TripRequirementSchema(BaseSchema):
    """Serialises and deserialises TripRequirement entities.

    Authorship (`proposed_by_member_id`) and contributions are server-managed: the
    proposer is stamped in the service from the caller, and contributions are created
    through the dedicated contribute endpoint. None of those are client-loadable here.
    """

    inventory_id = fields.UUID(load_only=True, required=False, allow_none=True)
    name = fields.String(required=True)
    category = fields.String(allow_none=True, load_default=None)
    catalog_item_id = fields.UUID(allow_none=True, load_default=None)

    proposed_by = fields.Nested(_ShallowMemberSchema, dump_only=True)
    contributions = fields.List(
        fields.Nested(_ContributionSchema), dump_only=True
    )
    # Derived on the model (covered when ≥1 contribution, else needed) — never stored.
    status = fields.Enum(
        RequirementStatusType, by_value=True, dump_only=True
    )

    @pre_load
    def sanitize_text_fields(self, data, **kwargs):
        for key in _SANITIZE_FIELDS:
            if data.get(key) is not None:
                data[key] = bleach.clean(str(data[key]).strip(), tags=[], strip=True)
        return data

    @validates('name')
    def validate_name(self, value, **kwargs):
        if not value or not value.strip():
            raise ValidationError("Requirement name cannot be empty")
        if len(value) > 255:
            raise ValidationError("Requirement name cannot exceed 255 characters")

    @validates('category')
    def validate_category(self, value, **kwargs):
        if value is not None and len(value) > 255:
            raise ValidationError("Requirement category cannot exceed 255 characters")

    @post_load
    def make_requirement(self, data, **kwargs):
        return TripRequirement(**data)
