from flask import g
from marshmallow import fields, post_load, pre_load, validates, ValidationError
import bleach

from Models.log import Log
from Schemas.base_schema import BaseSchema


class _ShallowEndorserSchema(BaseSchema):
    """Minimal endorser identity — never leaks credentials, contact, or related collections."""
    id = fields.UUID(dump_only=True)
    username = fields.String(dump_only=True)
    name = fields.String(dump_only=True)
    avatar_url = fields.String(dump_only=True)


class LogSchema(BaseSchema):
    hours = fields.Float(allow_none=True)
    avg_sea = fields.Integer(allow_none=True)
    distance = fields.Float(allow_none=True)
    date = fields.Date(allow_none=True)
    notes = fields.String(allow_none=True)
    user_id = fields.UUID(dump_only=True)
    # The trip this log documents — loadable (optional) and the endorsement key.
    trip_id = fields.UUID(allow_none=True, load_default=None)
    # Set server-side only: ExpeditionLogService for auto-generated logs, defaulted
    # 'manual' at the model layer otherwise.
    route_geojson = fields.Raw(dump_only=True, allow_none=True)
    source = fields.String(dump_only=True)
    # Derived projections — never stored. endorsers is shallow on purpose (no rank/cert fields):
    # endorsement is flat factual attestation, not a rank broadcast.
    endorsement_count = fields.Method("get_endorsement_count", dump_only=True)
    endorsers = fields.List(
        fields.Nested(_ShallowEndorserSchema),
        dump_only=True,
        attribute="user_endorsed_logs",
    )

    def get_endorsement_count(self, obj):
        return len(obj.user_endorsed_logs)

    @pre_load
    def sanitize_text_fields(self, data, **kwargs):
        if data.get("notes") is not None:
            data["notes"] = bleach.clean(str(data["notes"]).strip(), tags=[], strip=True)
        return data

    @validates('hours')
    def validate_hours(self, value, **kwargs):
        if value is not None and not (0 <= value <= 24):
            raise ValidationError("Hours must be between 0 and 24")

    @validates('avg_sea')
    def validate_avg_sea(self, value, **kwargs):
        if value is not None:
            if not isinstance(value, int):
                raise ValidationError("Beaufort sea state must be a whole number")
            if not (0 <= value <= 12):
                raise ValidationError("Beaufort sea state must be between 0 and 12")

    @validates('distance')
    def validate_distance(self, value, **kwargs):
        if value is not None and value < 0:
            raise ValidationError("Distance cannot be negative")

    @validates('notes')
    def validate_notes(self, value, **kwargs):
        if value is not None and len(value) > 2000:
            raise ValidationError("Notes cannot exceed 2000 characters")

    @post_load
    def make_log(self, data, **kwargs):
        data["user_id"] = g.current_user_id
        return Log(**data)
