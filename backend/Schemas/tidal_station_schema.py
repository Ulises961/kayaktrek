import bleach
from marshmallow import fields, pre_load, validates, ValidationError, post_load

from Models.tidal_station import TidalStation
from Schemas.base_schema import BaseSchema
from Schemas.geometry_field import GeometryField
from Schemas.tidal_stream_entry_schema import TidalStreamEntrySchema

_SANITIZE_FIELDS = ("name", "source", "notes")


def _sanitize_station_text(data):
    for key in _SANITIZE_FIELDS:
        if data.get(key) is not None:
            data[key] = bleach.clean(str(data[key]).strip(), tags=[], strip=True)
    return data


class TidalStationSchema(BaseSchema):
    name = fields.String(allow_none=False, required=True)
    location = GeometryField(allow_none=False, required=True)
    source = fields.String(allow_none=True, load_default=None)
    notes = fields.String(allow_none=True, load_default=None)
    mean_spring_range_m = fields.Float(allow_none=True, load_default=None)
    tidal_stream_entries = fields.List(
        fields.Nested(TidalStreamEntrySchema), allow_none=True, load_default=[]
    )

    @pre_load
    def sanitize_text_fields(self, data, **kwargs):
        return _sanitize_station_text(data)

    @validates("name")
    def validate_name(self, value, **kwargs):
        if len(value.strip()) == 0:
            raise ValidationError("Station name cannot be empty")
        if len(value) > 255:
            raise ValidationError("Station name cannot exceed 255 characters")

    @validates("mean_spring_range_m")
    def validate_mean_spring_range(self, value, **kwargs):
        if value is not None and value < 0:
            raise ValidationError("mean_spring_range_m cannot be negative")

    @post_load
    def make_station(self, data, **kwargs):
        entries = data.pop("tidal_stream_entries", None) or []
        station = TidalStation(**data)
        station.tidal_stream_entries = entries
        return station


class TidalStationUpdateSchema(BaseSchema):
    """Validates PATCH body for TidalStation. Returns a dict — no model instantiation."""

    name = fields.String(allow_none=False)
    source = fields.String(allow_none=True)
    notes = fields.String(allow_none=True)
    mean_spring_range_m = fields.Float(allow_none=True)

    @pre_load
    def sanitize_text_fields(self, data, **kwargs):
        return _sanitize_station_text(data)

    @validates("name")
    def validate_name(self, value, **kwargs):
        if len(value.strip()) == 0:
            raise ValidationError("Station name cannot be empty")
        if len(value) > 255:
            raise ValidationError("Station name cannot exceed 255 characters")

    @validates("mean_spring_range_m")
    def validate_mean_spring_range(self, value, **kwargs):
        if value is not None and value < 0:
            raise ValidationError("mean_spring_range_m cannot be negative")
