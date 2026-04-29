from marshmallow import fields, post_load
from Models.image import Image
from Schemas.base_schema import BaseSchema


class ImageSchema(BaseSchema):
    """
    Serialises Image records.
    Size/MIME validation is handled upstream by StorageService before the
    record is created — the schema is load/dump only, no defensive re-checks.
    """
    name = fields.String(allow_none=True)
    size = fields.Integer(allow_none=True)       # bytes, stored for display
    location = fields.String(allow_none=True)    # MinIO URL, persisted and returned as-is

    @post_load
    def make_image(self, data, **kwargs):
        return Image(**data)
