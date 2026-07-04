import bleach
from marshmallow import fields, post_dump, post_load, pre_load
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
    name = fields.String(allow_none=True)
    size = fields.Integer(allow_none=True)       # bytes, stored for display
    location = fields.String(allow_none=True)    # MinIO URL, persisted and returned as-is
    is_public = fields.Boolean(dump_only=True)

    @pre_load
    def sanitize_text_fields(self, data, **kwargs):
        # name is a user-supplied caption/filename; location is a server-generated URL.
        if data.get("name") is not None:
            data["name"] = bleach.clean(str(data["name"]).strip(), tags=[], strip=True)
        return data

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
