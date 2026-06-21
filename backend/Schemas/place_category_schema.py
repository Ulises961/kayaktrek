import re

import bleach
from marshmallow import fields, pre_load, validates, ValidationError

from Schemas.base_schema import BaseSchema
from Models.place_category import PlaceCategory

# Slugs are lowercase words joined by underscores (matching the seed: freshwater,
# first_aid). Icons are kebab-case Lucide glyph names (triangle-alert), keyed that
# way by the frontend marker map.
_SLUG_RE = re.compile(r"^[a-z0-9]+(_[a-z0-9]+)*$")
_ICON_RE = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")


class PlaceCategorySchema(BaseSchema):
    """Read-only from the client's perspective — the marker layer dumps slug/name/
    icon. Authoring is admin-only via PlaceCategoryCreateSchema."""
    slug = fields.String(dump_only=True)
    name = fields.String(dump_only=True)
    icon = fields.String(dump_only=True)

    class Meta(BaseSchema.Meta):
        model = PlaceCategory


class PlaceCategoryCreateSchema(BaseSchema):
    """Admin-only create body for a new place category. Returns a dict; the service
    builds the row. The catalogue is an entity (not an enum) precisely so it can grow
    without a migration — this is the admin tool that extends the seeded set. The
    public/community taxonomy + moderation is M7. Note: the `icon` only renders as a
    distinct glyph if its name is in the frontend's place-icons map; unknown names
    fall back to a plain pin."""

    slug = fields.String(required=True)
    name = fields.String(required=True)
    icon = fields.String(allow_none=True, load_default=None)

    @pre_load
    def normalise(self, data, **kwargs):
        cleaned = dict(data)
        if cleaned.get("slug") is not None:
            cleaned["slug"] = str(cleaned["slug"]).strip().lower()
        if cleaned.get("name") is not None:
            cleaned["name"] = bleach.clean(str(cleaned["name"]).strip(), tags=[], strip=True)
        if cleaned.get("icon") is not None:
            cleaned["icon"] = str(cleaned["icon"]).strip().lower() or None
        return cleaned

    @validates("slug")
    def validate_slug(self, value, **kwargs):
        if not _SLUG_RE.match(value or ""):
            raise ValidationError("Slug must be lowercase words separated by underscores")
        if len(value) > 100:
            raise ValidationError("Slug cannot exceed 100 characters")

    @validates("name")
    def validate_name(self, value, **kwargs):
        if value is None or len(value.strip()) == 0:
            raise ValidationError("Category name cannot be empty")
        if len(value) > 100:
            raise ValidationError("Category name cannot exceed 100 characters")

    @validates("icon")
    def validate_icon(self, value, **kwargs):
        if value is None:
            return
        if not _ICON_RE.match(value):
            raise ValidationError("Icon must be a kebab-case glyph name")
        if len(value) > 100:
            raise ValidationError("Icon cannot exceed 100 characters")

    class Meta(BaseSchema.Meta):
        model = PlaceCategory
