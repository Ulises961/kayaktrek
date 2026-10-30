from Services.Utils.text_sanitizer import sanitize_text
from marshmallow import fields, post_load, validates, validates_schema, ValidationError

from Models.travel_document import TravelDocument, TravelDocumentType
from Schemas.base_schema import BaseSchema


class TravelDocumentSchema(BaseSchema):
    trip_id = fields.UUID(dump_only=True)
    owner_id = fields.UUID(dump_only=True)
    attachment_path = fields.String(dump_only=True)

    type = fields.Enum(TravelDocumentType, by_value=True, required=True)
    name = fields.String(required=True)
    date = fields.Date(allow_none=True, load_default=None)
    expiry_date = fields.Date(allow_none=True, load_default=None)
    confirmation_number = fields.String(allow_none=True, load_default=None)
    url = fields.String(allow_none=True, load_default=None)
    notes = fields.String(allow_none=True, load_default=None)

    @validates("name")
    def validate_name(self, value, **kwargs):
        if not value or not value.strip():
            raise ValidationError("Name cannot be empty")

    @validates_schema
    def validate_date_order(self, data, **kwargs):
        date = data.get("date")
        expiry_date = data.get("expiry_date")
        if date and expiry_date and expiry_date < date:
            raise ValidationError(
                "Expiry date must be on or after the document date.",
                field_name="expiry_date",
            )

    @post_load
    def sanitize_and_make(self, data, **kwargs):
        for field in ("name", "notes", "confirmation_number", "url"):
            if data.get(field):
                data[field] = sanitize_text(data[field])
        return TravelDocument(**data)
