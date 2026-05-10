import bleach
from marshmallow import fields, post_load, validates, ValidationError

from Models.travel_document import TravelDocument, TravelDocumentType
from Schemas.base_schema import BaseSchema

_VALID_TYPES = {t.value for t in TravelDocumentType}


class TravelDocumentSchema(BaseSchema):
    trip_id = fields.UUID(dump_only=True)
    owner_id = fields.UUID(dump_only=True)
    attachment_path = fields.String(dump_only=True)

    type = fields.String(required=True)
    name = fields.String(required=True)
    date = fields.Date(allow_none=True, load_default=None)
    expiry_date = fields.Date(allow_none=True, load_default=None)
    confirmation_number = fields.String(allow_none=True, load_default=None)
    url = fields.String(allow_none=True, load_default=None)
    notes = fields.String(allow_none=True, load_default=None)

    @validates("type")
    def validate_type(self, value, **kwargs):
        if value not in _VALID_TYPES:
            raise ValidationError(f"Type must be one of: {', '.join(sorted(_VALID_TYPES))}")

    @validates("name")
    def validate_name(self, value, **kwargs):
        if not value or not value.strip():
            raise ValidationError("Name cannot be empty")

    @post_load
    def sanitize_and_make(self, data, **kwargs):
        for field in ("name", "notes", "confirmation_number", "url"):
            if data.get(field):
                data[field] = bleach.clean(str(data[field]).strip(), tags=[], strip=True)
        data["type"] = TravelDocumentType(data["type"])
        return TravelDocument(**data)
