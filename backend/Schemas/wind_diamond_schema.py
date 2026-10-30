from Services.Utils.text_sanitizer import sanitize_text
from marshmallow import fields, pre_load, validates, ValidationError

from Models.wind_diamond import WindDiamond
from Schemas.base_schema import BaseSchema
from Schemas.geometry_field import GeometryField

_SANITIZE_FIELDS = ("name", "notes")


def _sanitize_wind_diamond_text(data):
    for key in _SANITIZE_FIELDS:
        if data.get(key) is not None:
            data[key] = sanitize_text(data[key])
    return data


class WindDiamondSchema(BaseSchema):
    """Create + serialise a WindDiamond. A static hazard reminder — name and
    notes are both optional free text, never rate/direction/intensity data
    (docs/adr/features.md "Revision (M27)"). Ownership (itinerary_id,
    created_by_user_id) is dump-only — the service stamps it."""

    name = fields.String(allow_none=True, load_default=None)
    location = GeometryField(required=True)
    notes = fields.String(allow_none=True, load_default=None)
    itinerary_id = fields.UUID(dump_only=True)
    created_by_user_id = fields.UUID(dump_only=True)
    created = fields.DateTime(dump_only=True)

    @pre_load
    def sanitize_text_fields(self, data, **kwargs):
        return _sanitize_wind_diamond_text(data)

    @validates("name")
    def validate_name(self, value, **kwargs):
        if value is not None and len(value) > 255:
            raise ValidationError("Name cannot exceed 255 characters")

    class Meta(BaseSchema.Meta):
        model = WindDiamond


class WindDiamondUpdateSchema(BaseSchema):
    """Validates a PATCH body — only whitelisted fields are accepted, all optional.
    Returns a dict (no model instantiation); the service applies the changes."""

    name = fields.String(allow_none=True, required=False)
    location = GeometryField(required=False)
    notes = fields.String(allow_none=True, required=False)

    @pre_load
    def sanitize_text_fields(self, data, **kwargs):
        return _sanitize_wind_diamond_text(data)

    @validates("name")
    def validate_name(self, value, **kwargs):
        if value is not None and len(value) > 255:
            raise ValidationError("Name cannot exceed 255 characters")
