import bleach
from marshmallow import fields, pre_load, validates, ValidationError

from Models.place import Place
from Schemas.base_schema import BaseSchema
from Schemas.geometry_field import GeometryField
from Schemas.place_category_schema import PlaceCategorySchema

_SANITIZE_FIELDS = ("label", "note")


def _sanitize_place_text(data):
    for key in _SANITIZE_FIELDS:
        if data.get(key) is not None:
            data[key] = bleach.clean(str(data[key]).strip(), tags=[], strip=True)
    return data


class PlaceSchema(BaseSchema):
    """Create + serialise a Place. Location is a GeoJSON Point both ways. On load
    the category is chosen by id; on dump the resolved category (slug/name/icon) is
    nested so a marker renders without a separate join. Ownership (itinerary_id,
    created_by_user_id) and visibility are dump-only — the service stamps them."""

    location = GeometryField(required=True)
    category_id = fields.UUID(required=True, load_only=True)
    category = fields.Nested(PlaceCategorySchema, dump_only=True)
    label = fields.String(required=True)
    note = fields.String(allow_none=True, load_default=None)
    visibility = fields.Function(
        lambda place: place.visibility.value if place.visibility else None, dump_only=True
    )
    itinerary_id = fields.UUID(dump_only=True)
    created_by_user_id = fields.UUID(dump_only=True)
    created = fields.DateTime(dump_only=True)

    @pre_load
    def sanitize_text_fields(self, data, **kwargs):
        return _sanitize_place_text(data)

    @validates("label")
    def validate_label(self, value, **kwargs):
        if value is None or len(value.strip()) == 0:
            raise ValidationError("Place label cannot be empty")
        if len(value) > 255:
            raise ValidationError("Place label cannot exceed 255 characters")

    class Meta(BaseSchema.Meta):
        model = Place


class PlaceUpdateSchema(BaseSchema):
    """Validates a PATCH body — only whitelisted fields are accepted, all optional.
    Returns a dict (no model instantiation); the service applies the changes."""

    location = GeometryField(required=False)
    category_id = fields.UUID(required=False)
    label = fields.String(required=False)
    note = fields.String(allow_none=True, required=False)

    @pre_load
    def sanitize_text_fields(self, data, **kwargs):
        return _sanitize_place_text(data)

    @validates("label")
    def validate_label(self, value, **kwargs):
        if value is None or len(value.strip()) == 0:
            raise ValidationError("Place label cannot be empty")
        if len(value) > 255:
            raise ValidationError("Place label cannot exceed 255 characters")
