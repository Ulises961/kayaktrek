from marshmallow import Schema, fields, EXCLUDE

from Schemas.base_schema import camelcase


class HazardDiamondPositionSchema(Schema):
    """Position-only projection of a tidal or wind diamond (M27 "Revision
    (M27): position-only diamond sharing" — docs/adr/features.md). Shared
    cross-trip/cross-user: an unlabeled pin, never the diamond's content
    (name/notes/rate/direction)."""

    class Meta:
        unknown = EXCLUDE

    id = fields.String()
    lat = fields.Float()
    lng = fields.Float()
    kind = fields.String()

    def on_bind_field(self, field_name, field_obj):
        field_obj.data_key = camelcase(field_obj.data_key or field_name)
