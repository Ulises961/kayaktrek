import bleach
from marshmallow import (
    fields, post_dump, post_load, pre_load, validates, ValidationError
)
from Models.image import Image
from Schemas.base_schema import BaseSchema
from Services.storage_service import StorageService

_PRESIGNED_URL_TTL_SECONDS = 900


class ImageSchema(BaseSchema):
    """
    Serialises Image records.
    Size/MIME validation is handled upstream by StorageService before the
    record is created — the schema is load/dump only, no defensive re-checks.
    """
    name = fields.String(allow_none=True)        # original upload filename, metadata only
    size = fields.Integer(allow_none=True)       # bytes, stored for display
    location = fields.String(allow_none=True)    # MinIO URL, persisted and returned as-is
    is_public = fields.Boolean(dump_only=True)
    caption = fields.String(allow_none=True)     # what the photo shows, author-written

    @pre_load
    def sanitize_text_fields(self, data, **kwargs):
        # Both are client-supplied free text; location is a server-generated URL.
        for key in ("name", "caption"):
            if data.get(key) is not None:
                data[key] = bleach.clean(str(data[key]).strip(), tags=[], strip=True)
        return data

    @validates("caption")
    def validate_caption(self, value, **kwargs):
        if value is not None and len(value) > 300:
            raise ValidationError("Caption cannot exceed 300 characters")

    @post_load
    def make_image(self, data, **kwargs):
        return Image(**data)

    @post_dump(pass_original=True)
    def presign_private_location(self, data, original_image, **kwargs):
        # Private images live outside the public-read bucket policy — the stored
        # location isn't directly fetchable, so swap in a short-TTL presigned URL.
        # Public images keep their direct URL as-is.
        if not original_image.is_public and original_image.location:
            object_key = StorageService.object_key_from_url(original_image.location, "image-private")
            data["location"] = StorageService.presigned_url(
                object_key, "image-private", expires_in=_PRESIGNED_URL_TTL_SECONDS
            )
        return data


class ImageUpdateSchema(BaseSchema):
    """PATCH /api/point/<id>/images/<image_id> — the author-editable fields.

    Returns a plain dict for the service layer. `is_public` is deliberately absent:
    changing visibility moves the stored object between bucket prefixes, so it goes
    through ImageService.set_public rather than a field assignment.
    """
    caption = fields.String(allow_none=True)

    @pre_load
    def sanitize_text_fields(self, data, **kwargs):
        if data.get("caption") is not None:
            data["caption"] = bleach.clean(str(data["caption"]).strip(), tags=[], strip=True)
        return data

    @validates("caption")
    def validate_caption(self, value, **kwargs):
        if value is not None and len(value) > 300:
            raise ValidationError("Caption cannot exceed 300 characters")

    @post_load
    def to_dict(self, data, **kwargs):
        return data
