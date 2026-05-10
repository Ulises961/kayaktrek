from marshmallow import fields, post_load, validates, ValidationError

from Models.document import Document, DocumentType
from Schemas.base_schema import BaseSchema


class DocumentSchema(BaseSchema):
    trip_id = fields.UUID(dump_only=True)
    owner_id = fields.UUID(dump_only=True)
    type = fields.String(required=True)
    name = fields.String(required=True)
    expiry_date = fields.Date(allow_none=True, load_default=None)
    notes = fields.String(allow_none=True, load_default=None)

    @validates("type")
    def validate_type(self, value, **kwargs):
        valid = {t.value for t in DocumentType}
        if value not in valid:
            raise ValidationError(f"Type must be one of: {', '.join(valid)}")

    @validates("name")
    def validate_name(self, value, **kwargs):
        if not value or not value.strip():
            raise ValidationError("Name cannot be empty")

    @post_load
    def make_document(self, data, **kwargs):
        data["type"] = DocumentType(data["type"])
        return Document(**data)
