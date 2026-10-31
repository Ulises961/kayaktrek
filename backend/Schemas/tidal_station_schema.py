from Services.Utils.text_sanitizer import sanitize_text
from geoalchemy2.shape import to_shape
from marshmallow import fields, pre_load, validates, validates_schema, ValidationError, post_load

from Models.tidal_station import StreamEntryMode, TidalStation
from Schemas.base_schema import BaseSchema
from Schemas.geometry_field import GeometryField
from Schemas.tidal_stream_entry_schema import TidalStreamEntrySchema

_SANITIZE_FIELDS = ("name", "source", "notes")

# Simple-mode peak inputs that drive rule-of-thirds synthesis (must all be present).
_SIMPLE_REQUIRED = ("max_spring_rate_knots", "flood_direction_degrees", "ebb_direction_degrees")


def _sanitize_station_text(data):
    for key in _SANITIZE_FIELDS:
        if data.get(key) is not None:
            data[key] = sanitize_text(data[key])
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


class TidalStationPositionSchema(BaseSchema):
    """Position-only projection for a user-created station the caller does not
    own (M27). Withholds name/source/notes/mean_spring_range_m/hourly entries
    — the content tier that stays trip-private."""

    location = fields.Method("get_location", dump_only=True)
    is_user_created = fields.Boolean(dump_only=True)

    def get_location(self, station):
        if station.location is None:
            return None
        shape = to_shape(station.location)
        return {"type": "Point", "coordinates": [shape.x, shape.y]}


class _DiamondFieldValidators:
    """Shared field-level validation for the user-diamond create/update schemas.

    Each `@validates` only fires for fields actually present in the payload, so
    the same set serves both a full create and a partial PATCH.
    """

    @pre_load
    def sanitize_text_fields(self, data, **kwargs):
        return _sanitize_station_text(data)

    @validates("name")
    def validate_name(self, value, **kwargs):
        if len(value.strip()) == 0:
            raise ValidationError("Diamond name cannot be empty")
        if len(value) > 255:
            raise ValidationError("Diamond name cannot exceed 255 characters")

    @validates("mean_spring_range_m")
    def validate_mean_spring_range(self, value, **kwargs):
        if value is not None and value < 0:
            raise ValidationError("mean_spring_range_m cannot be negative")

    @validates("radius_m")
    def validate_radius(self, value, **kwargs):
        if value is not None and not (0 < value <= 20000):
            raise ValidationError("radius_m must be between 0 and 20000 metres")

    @validates("flood_direction_degrees")
    def validate_flood_direction(self, value, **kwargs):
        if value is not None and not (0 <= value <= 360):
            raise ValidationError("Flood direction must be between 0 and 360 degrees")

    @validates("ebb_direction_degrees")
    def validate_ebb_direction(self, value, **kwargs):
        if value is not None and not (0 <= value <= 360):
            raise ValidationError("Ebb direction must be between 0 and 360 degrees")

    @validates("max_spring_rate_knots")
    def validate_max_spring_rate(self, value, **kwargs):
        if value is not None and not (0 <= value <= 20):
            raise ValidationError("Max spring rate must be between 0 and 20 knots")

    @validates("max_neap_rate_knots")
    def validate_max_neap_rate(self, value, **kwargs):
        if value is not None and not (0 <= value <= 20):
            raise ValidationError("Max neap rate must be between 0 and 20 knots")


class TidalDiamondCreateSchema(_DiamondFieldValidators, BaseSchema):
    """Validates a user-created tidal diamond payload → dict for the service.

    `entry_mode` selects how the hourly table is built: `simple` synthesises it
    from the peak inputs (rule of thirds); `atlas` stores a supplied per-hour table.
    """

    name = fields.String(required=True)
    location = GeometryField(required=True)
    source = fields.String(allow_none=True, load_default=None)
    notes = fields.String(allow_none=True, load_default=None)
    mean_spring_range_m = fields.Float(allow_none=True, load_default=None)
    radius_m = fields.Float(allow_none=True, load_default=None)
    entry_mode = fields.Enum(StreamEntryMode, by_value=True, required=True)
    max_spring_rate_knots = fields.Float(allow_none=True, load_default=None)
    max_neap_rate_knots = fields.Float(allow_none=True, load_default=None)
    flood_direction_degrees = fields.Float(allow_none=True, load_default=None)
    ebb_direction_degrees = fields.Float(allow_none=True, load_default=None)
    tidal_stream_entries = fields.List(
        fields.Nested(TidalStreamEntrySchema), allow_none=True, load_default=None
    )

    @validates_schema
    def validate_mode_inputs(self, data, **kwargs):
        mode = data.get("entry_mode")
        if mode == StreamEntryMode.SIMPLE:
            missing = [f for f in _SIMPLE_REQUIRED if data.get(f) is None]
            if missing:
                raise ValidationError(
                    {f: ["Required for a simple-mode diamond."] for f in missing}
                )
        elif mode == StreamEntryMode.ATLAS and not data.get("tidal_stream_entries"):
            raise ValidationError(
                {"tidal_stream_entries": ["Required for an advanced-mode diamond."]}
            )


class TidalDiamondEditSchema(BaseSchema):
    """Dump-only raw view of a user diamond for edit-form prefill.

    Carries the per-hour table verbatim plus the reconstructed simple-mode peak
    inputs (null for atlas diamonds). The matching write path is the PATCH body
    validated by TidalDiamondUpdateSchema.
    """

    name = fields.String()
    entry_mode = fields.String()
    radius_m = fields.Float(allow_none=True)
    is_user_created = fields.Boolean()
    max_spring_rate_knots = fields.Float(allow_none=True)
    max_neap_rate_knots = fields.Float(allow_none=True)
    flood_direction_degrees = fields.Float(allow_none=True)
    ebb_direction_degrees = fields.Float(allow_none=True)
    tidal_stream_entries = fields.List(fields.Nested(TidalStreamEntrySchema))


class TidalDiamondUpdateSchema(_DiamondFieldValidators, BaseSchema):
    """Validates a partial PATCH for a user diamond → dict for the service.

    All fields optional; the service rebuilds the hourly table only when the
    entry mode or a stream input is present (and raises on incomplete simple input).
    """

    name = fields.String()
    location = GeometryField()
    source = fields.String(allow_none=True)
    notes = fields.String(allow_none=True)
    mean_spring_range_m = fields.Float(allow_none=True)
    radius_m = fields.Float(allow_none=True)
    entry_mode = fields.Enum(StreamEntryMode, by_value=True)
    max_spring_rate_knots = fields.Float(allow_none=True)
    max_neap_rate_knots = fields.Float(allow_none=True)
    flood_direction_degrees = fields.Float(allow_none=True)
    ebb_direction_degrees = fields.Float(allow_none=True)
    tidal_stream_entries = fields.List(fields.Nested(TidalStreamEntrySchema), allow_none=True)
