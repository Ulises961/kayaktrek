from Services.Utils.text_sanitizer import sanitize_text
from datetime import date
from marshmallow import fields, post_load, pre_load, validates, ValidationError

from Models.user_certification import UserCertification
from Schemas.base_schema import BaseSchema

_SANITIZE_FIELDS = ("organization", "award", "membershipNumber")


class UserCertificationSchema(BaseSchema):
    user_id = fields.UUID(dump_only=True)
    organization = fields.String(required=True)
    award = fields.String(required=True)
    membership_number = fields.String(allow_none=True, load_default=None)
    awarded_at = fields.Date(allow_none=True, load_default=None)
    valid_until = fields.Date(allow_none=True, load_default=None)
    is_expired = fields.Method("get_is_expired", dump_only=True)

    @pre_load
    def sanitize_text_fields(self, data, **kwargs):
        for key in _SANITIZE_FIELDS:
            if data.get(key) is not None:
                data[key] = sanitize_text(data[key])
        return data

    @validates("organization")
    def validate_organization(self, value, **kwargs):
        if not value or not value.strip():
            raise ValidationError("Organization cannot be empty")
        if len(value.strip()) > 100:
            raise ValidationError("Organization cannot exceed 100 characters")

    @validates("award")
    def validate_award(self, value, **kwargs):
        if not value or not value.strip():
            raise ValidationError("Award cannot be empty")
        if len(value.strip()) > 200:
            raise ValidationError("Award cannot exceed 200 characters")

    @validates("membership_number")
    def validate_membership_number(self, value, **kwargs):
        if value is not None and len(value.strip()) > 100:
            raise ValidationError("Membership number cannot exceed 100 characters")

    def get_is_expired(self, obj):
        """Compute whether a certification has expired (valid_until is in the past)."""
        if obj.valid_until is None:
            return False
        return obj.valid_until < date.today()

    @post_load
    def make_certification(self, data, **kwargs):
        return UserCertification(**data)
