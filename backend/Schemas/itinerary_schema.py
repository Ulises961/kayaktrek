from typing import Optional

from flask import g
from marshmallow import fields, post_dump, post_load, pre_load, validates, ValidationError
import bleach
from Api.database import db
from Models.itinerary import Itinerary
from Models.trip import Trip
from Schemas.base_schema import BaseSchema
from Schemas.day_schema import DaySchema, DayPublicSchema
from Services.Utils.route_distance import compute_total_miles


class ItinerarySchema(BaseSchema):
    # name is load_default=None; the service resolves it from trip.destination when absent
    name = fields.String(load_default=None, allow_none=True)
    is_public = fields.Boolean(load_default=False)
    avg_speed_knots = fields.Float(load_default=2.5)
    # Derived on read (see Services.Utils.route_distance) — the stored column is never
    # written to after creation, so it cannot be trusted as a live aggregate.
    total_miles = fields.Method("get_total_miles", dump_only=True)
    expected_total_miles = fields.Float(
        allow_none=True, validate=lambda x: x is None or (0 <= x <= 50000)
    )
    created_from_id = fields.UUID(allow_none=True, dump_only=True)
    days = fields.List(
        fields.Nested(DaySchema),
        allow_none=True,
        metadata={"exclude": ["itinerary_id"]},
        validate=lambda x: x is None or len(x) <= 365,
    )
    trip_id = fields.UUID(allow_none=True, load_default=None)
    user_id = fields.UUID(dump_only=True)
    # Unlisted story-share token (M7d) — only ever dumped back to the owner right
    # after generate/regenerate; never present on the public/explore projections.
    story_share_token = fields.String(dump_only=True, allow_none=True)

    def get_total_miles(self, itinerary: Itinerary) -> float:
        return compute_total_miles(itinerary.days or [])

    @pre_load
    def sanitize_text_fields(self, data, **kwargs):
        if 'name' in data and data['name'] is not None:
            data['name'] = bleach.clean(str(data['name']).strip(), tags=[], strip=True)
        return data

    @validates('name')
    def validate_name(self, value, **kwargs):
        if value is not None and len(value) > 255:
            raise ValidationError("Name cannot exceed 255 characters")

    @validates('avg_speed_knots')
    def validate_avg_speed_knots(self, value, **kwargs):
        if value is not None and not (0.5 <= value <= 20.0):
            raise ValidationError("Average speed must be between 0.5 and 20.0 knots")

    @post_dump
    def exclude_day_zero(self, data, **kwargs):
        # Set schema.include_staging = True before dumping to keep Day 0 in the response.
        if not getattr(self, "include_staging", False) and data.get("days"):
            data["days"] = [d for d in data["days"] if d.get("dayNumber") != 0]
        return data

    @post_load
    def make_itinerary(self, data, **kwargs):
        data["user_id"] = g.current_user_id
        return Itinerary(**data)


class ItineraryUpdateSchema(BaseSchema):
    """
    Schema for PATCH /api/itinerary/<id>.
    All fields optional. Returns a validated plain dict for the service layer.
    """
    name = fields.String(allow_none=True)
    is_public = fields.Boolean()
    avg_speed_knots = fields.Float()
    trip_id = fields.UUID(allow_none=True)

    @pre_load
    def sanitize_text_fields(self, data, **kwargs):
        if 'name' in data and data['name'] is not None:
            data['name'] = bleach.clean(str(data['name']).strip(), tags=[], strip=True)
        return data

    @validates('name')
    def validate_name(self, value, **kwargs):
        if value is not None and len(value) > 255:
            raise ValidationError("Name cannot exceed 255 characters")

    @validates('avg_speed_knots')
    def validate_avg_speed_knots(self, value, **kwargs):
        if value is not None and not (0.5 <= value <= 20.0):
            raise ValidationError("Average speed must be between 0.5 and 20.0 knots")

    @post_load
    def to_dict(self, data, **kwargs):
        return data


class OriginalAuthorSchema(BaseSchema):
    """Shallow projection of a fork-source itinerary's author (M7c attribution).

    `linkable` mirrors the author's profile_is_public so the frontend only deep-links
    to a public profile.
    """
    username = fields.String(dump_only=True)
    name = fields.String(dump_only=True, allow_none=True)
    linkable = fields.Boolean(dump_only=True)


class ItineraryExploreItemSchema(BaseSchema):
    """One row of the /explore discovery listing (unauthenticated).

    Fed snake_case dicts from ItineraryService.search_public_itineraries — facets are
    derived from the route's own points/dates; no Trip data is present.
    """
    name = fields.String(dump_only=True)
    total_miles = fields.Float(dump_only=True, allow_none=True)
    day_count = fields.Integer(dump_only=True)
    season = fields.String(dump_only=True, allow_none=True)
    centroid_lat = fields.Float(dump_only=True, allow_none=True)
    centroid_lng = fields.Float(dump_only=True, allow_none=True)
    created_from_id = fields.UUID(dump_only=True, allow_none=True)
    original_author = fields.Nested(
        OriginalAuthorSchema, dump_only=True, allow_none=True
    )


class ItineraryPublicSchema(BaseSchema):
    """Stripped schema for unauthenticated public itinerary access.

    Excludes user_id, trip_id, notes, and private images. `created_from_id` +
    `original_author` surface fork attribution (M7c); the resource injects
    `original_author` via ItineraryService.resolve_original_author before dumping.
    `trip_state` (M7d) exposes only the parent trip's lifecycle state — never any
    other trip field — as the seam a future live-position feature (M8) attaches to
    while `happening`.
    """
    name = fields.String(dump_only=True)
    is_public = fields.Boolean(dump_only=True)
    avg_speed_knots = fields.Float(dump_only=True)
    total_miles = fields.Method("get_total_miles", dump_only=True)
    created_from_id = fields.UUID(dump_only=True, allow_none=True)
    original_author = fields.Nested(
        OriginalAuthorSchema, dump_only=True, allow_none=True
    )
    days = fields.List(fields.Nested(DayPublicSchema), dump_only=True)
    trip_state = fields.Method("get_trip_state", dump_only=True)

    def get_total_miles(self, itinerary: Itinerary) -> float:
        return compute_total_miles(itinerary.days or [])

    def get_trip_state(self, itinerary: Itinerary) -> Optional[str]:
        if not itinerary.trip_id:
            return None
        trip = db.session.get(Trip, itinerary.trip_id)
        return trip.state.value if trip else None

    @post_dump
    def exclude_day_zero(self, data, **kwargs):
        if data.get("days"):
            data["days"] = [d for d in data["days"] if d.get("dayNumber") != 0]
        return data


class ItineraryExploreSchema(BaseSchema):
    """Lightweight schema for the /explore listing (unauthenticated).

    Returns id, name, total distance, and day count.
    """
    name = fields.String(dump_only=True)
    is_public = fields.Boolean(dump_only=True)
    total_miles = fields.Float(dump_only=True)
