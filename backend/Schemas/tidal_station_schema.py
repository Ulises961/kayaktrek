from marshmallow import Schema, fields, post_load, validates, ValidationError
import bleach

from Models.tidal_station import TidalStation
from Schemas.tidal_stream_entry_schema import TidalStreamEntrySchema


class TidalStationSchema(Schema):
    id = fields.UUID(dump_only=True)
    name = fields.String(allow_none=False, required=True, validate=lambda x: 0 < len(x.strip()) <= 255)
    location = fields.Dict(allow_none=False, required=True)
    source = fields.String(allow_none=True)
    notes = fields.String(allow_none=True)
    mean_spring_range_m = fields.Float(allow_none=True, validate=lambda x: x is None or x >= 0)
    tidal_stream_entries = fields.List(fields.Nested(TidalStreamEntrySchema), allow_none=True)

    @validates("name")
    def validate_name(self, value):
        sanitized = bleach.clean(value.strip(), tags=[], strip=True)
        if len(sanitized) == 0:
            raise ValidationError("Station name cannot be empty")
        if len(sanitized) > 255:
            raise ValidationError("Station name cannot exceed 255 characters")

    @post_load
    def make_station(self, data, **kwargs):
        entries = data.pop("tidal_stream_entries", None) or []
        station = TidalStation(**data)
        station.tidal_stream_entries = entries
        return station
