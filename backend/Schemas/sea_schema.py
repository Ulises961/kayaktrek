import re

import bleach
from marshmallow import Schema, fields, validates, ValidationError, pre_load, EXCLUDE

from Schemas.base_schema import camelcase
from Schemas.sea_state_schema import SeaStateSchema
from Services.tidal_service import TidalService


class RuleOfTwelfthsEntrySchema(Schema):

    class Meta:
        unknown = EXCLUDE

    hour_from_lw = fields.Float()
    cumulative_fraction = fields.Float()
    estimated_height_m = fields.Float()

    def on_bind_field(self, field_name, field_obj):
        field_obj.data_key = camelcase(field_obj.data_key or field_name)


_rot_schema = RuleOfTwelfthsEntrySchema(many=True)


class TidalGateWarningSchema(Schema):

    class Meta:
        unknown = EXCLUDE

    point_id = fields.UUID()
    station_name = fields.String()
    rate_knots = fields.Float()
    direction_degrees = fields.Float(allow_none=True)
    next_slack_utc = fields.String(allow_none=True)
    is_blocking = fields.Boolean()

    def on_bind_field(self, field_name, field_obj):
        field_obj.data_key = camelcase(field_obj.data_key or field_name)


_gate_schema = TidalGateWarningSchema(many=True)


class SeaSchema(Schema):
    """Sea serialisation schema.

    Sea uses day_id as its primary key (no independent id) — does not extend BaseSchema.
    """

    class Meta:
        unknown = EXCLUDE

    day_id = fields.UUID(dump_only=True)
    moon_phase = fields.String(allow_none=True, load_default=None)
    high_tide = fields.Time('%H:%M', allow_none=True, load_default=None)
    low_tide = fields.Time('%H:%M', allow_none=True, load_default=None)
    tidal_range_m = fields.Float(allow_none=True, load_default=None)
    sea_states = fields.List(fields.Nested(SeaStateSchema), dump_only=True)
    recorded_at = fields.DateTime(dump_only=True)
    rule_of_twelfths = fields.Method("get_rule_of_twelfths", dump_only=True)

    def on_bind_field(self, field_name, field_obj):
        field_obj.data_key = camelcase(field_obj.data_key or field_name)

    @pre_load
    def snake_to_camel_input(self, data, **kwargs):
        return {camelcase(k): v for k, v in data.items()}

    def get_rule_of_twelfths(self, obj):
        entries = TidalService.rule_of_twelfths(obj)
        if entries is None:
            return None
        return _rot_schema.dump(entries)

    @validates('moon_phase')
    def validate_moon_phase(self, value, **kwargs):
        if value is not None:
            sanitized = bleach.clean(value.strip(), tags=[], strip=True)
            if len(sanitized) > 50:
                raise ValidationError("Moon phase description cannot exceed 50 characters")
            if re.search(r'[<>"\';]', sanitized):
                raise ValidationError("Moon phase contains invalid characters")

    @validates('tidal_range_m')
    def validate_tidal_range(self, value, **kwargs):
        if value is not None and not (0 <= value <= 20):
            raise ValidationError("Tidal range must be between 0 and 20 metres")
