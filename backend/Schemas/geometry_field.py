from marshmallow import fields, ValidationError
from geoalchemy2.shape import from_shape, to_shape
from shapely.geometry import Point as ShapelyPoint


class GeometryField(fields.Field):
    """Marshmallow field for GeoJSON Point ↔ GeoAlchemy2 WKBElement."""

    def _serialize(self, value, attr, obj, **kwargs):
        if value is None:
            return None
        shape = to_shape(value)
        return {"type": "Point", "coordinates": [shape.x, shape.y]}

    def _deserialize(self, value, attr, data, **kwargs):
        if not isinstance(value, dict) or value.get("type") != "Point":
            raise ValidationError("location must be a GeoJSON Point object")
        coords = value.get("coordinates", [])
        if len(coords) < 2:
            raise ValidationError("coordinates must be [longitude, latitude]")
        try:
            lon, lat = float(coords[0]), float(coords[1])
        except (TypeError, ValueError):
            raise ValidationError("coordinates must be numeric")
        if not (-180 <= lon <= 180) or not (-90 <= lat <= 90):
            raise ValidationError("coordinates out of range")
        return from_shape(ShapelyPoint(lon, lat), srid=4326)
