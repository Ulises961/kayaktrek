import bleach
from marshmallow import fields, post_load, pre_load
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

    @pre_load
    def sanitize_text_fields(self, data, **kwargs):
        # name is a user-supplied caption/filename; location is a server-generated URL.
        if data.get("name") is not None:
            data["name"] = bleach.clean(str(data["name"]).strip(), tags=[], strip=True)
        return data

    @post_load
    def make_image(self, data, **kwargs):
        return Image(**data)
