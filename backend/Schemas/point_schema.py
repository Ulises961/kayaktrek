from marshmallow import fields, post_load, pre_load, validates, ValidationError, EXCLUDE
from Models.point import Point, PointType
from Schemas.base_schema import BaseSchema, camelcase
from Schemas.image_schema import ImageSchema
from Services.Utils.text_sanitizer import sanitize_text


class PointSchema(BaseSchema):
    class Meta:
        unknown = EXCLUDE
    """ 
    Point Schema
    used for loading/dumping Point entities
    """
    latitude = fields.Float(allow_none=True, validate=lambda x: x is None or (-90 <= x <= 90))
    longitude = fields.Float(allow_none=True, validate=lambda x: x is None or (-180 <= x <= 180))
    name = fields.String(allow_none=True, validate=lambda x: x is None or len(x.strip()) <= 255)
    notes = fields.String(allow_none=True, validate=lambda x: x is None or len(x.strip()) <= 5000)
    type = fields.Enum(PointType, by_value=True, required=True)
    day_id = fields.UUID(allow_none=True)
    next_id = fields.UUID(allow_none=True, dump_only=True)
    next = fields.Nested(lambda: PointSchema(), allow_none=True,
                         exclude=("next", "nearby"))
    nearby = fields.List(fields.Nested(lambda: PointSchema(
    ), allow_none=True, exclude=("next", "nearby")))
    images = fields.List(fields.Nested(ImageSchema, allow_none=True))

    @pre_load
    def sanitize_text_fields(self, data, **kwargs):
        if 'name' in data and data['name'] is not None:
            data['name'] = sanitize_text(data['name'])
        if 'notes' in data and data['notes'] is not None:
            data['notes'] = sanitize_text(data['notes'])
        return data

    @validates('type')
    def validate_type(self, value,  **kwargs):
        """Validate that point type is one of the allowed values."""
        valid_types_values = [t.value for t in PointType]
        valid_types =  [t for t in PointType]
        if value not in valid_types:
            raise ValidationError(
                f"Invalid point type. Must be one of: {', '.join(valid_types_values)}"
            )
    
    @validates('latitude')
    def validate_latitude(self, value,  **kwargs):
        """Validate latitude coordinates if provided."""
        if value is not None:
            if value < -90 or value > 90:
                raise ValidationError(
                    "Latitude must be between -90 and 90"
                )
    
    @validates('longitude')
    def validate_longitude(self, value,  **kwargs):
        """Validate longitude coordinates if provided."""
        if value is not None:
            if value < -180 or value > 180:
                raise ValidationError(
                    "Longitude must be between -180 and 180"
                )
    
    @validates('notes')
    def validate_notes(self, value,  **kwargs):
        """Validate notes length (sanitization happens in @pre_load)."""
        if value is not None and len(value) > 5000:
            raise ValidationError("Notes cannot exceed 5000 characters")

    @post_load
    def make_point(self, data, **kwargs):
        return Point(**data)


class PointUpdateSchema(PointSchema):
    """
    Schema for PATCH /api/point/<id>.
    Validates scalar mutable fields only (type, lat, lon, notes — all optional).
    Nested objects (images, next, nearby) are excluded from load;
    the resource handler merges validated scalars with the raw request.
    day_id excluded — point reassignment is handled by the day assign endpoint.
    Returns a camelCase dict for the service layer.
    """
    type = fields.Enum(PointType, by_value=True)
    day_id = fields.UUID(dump_only=True)
    next = fields.Nested(lambda: PointSchema(), dump_only=True)
    nearby = fields.List(fields.Nested(lambda: PointSchema()), dump_only=True)
    images = fields.List(fields.Nested(ImageSchema), dump_only=True)

    @post_load
    def make_point(self, data, **kwargs):
        return {camelcase(k): v for k, v in data.items()}


class PointPublicSchema(BaseSchema):
    """Point fields safe for unauthenticated exposure — geometry + classification, no notes."""
    latitude = fields.Float(dump_only=True, allow_none=True)
    longitude = fields.Float(dump_only=True, allow_none=True)
    name = fields.String(dump_only=True, allow_none=True)
    type = fields.Enum(PointType, by_value=True, dump_only=True, allow_none=True)
    day_id = fields.UUID(dump_only=True, allow_none=True)
    next_id = fields.UUID(dump_only=True, allow_none=True)
    # Photo-level opt-in — only images the owner explicitly made public, never the full
    # point.images list.
    images = fields.Method("get_public_images", dump_only=True)

    def get_public_images(self, point: Point) -> list:
        # url + caption only. The filename (Image.name) stays private: it is upload
        # metadata the author never wrote and can carry a real name or a location.
        return [
            {"url": image.location, "caption": image.caption}
            for image in point.images
            if image.is_public
        ]
