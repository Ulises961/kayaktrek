from typing import Optional

from flask import g
from marshmallow import fields, post_dump, post_load, pre_load, validates, ValidationError
import bleach
from Api.database import db
from Models.difficulty import DifficultyType
from Models.itinerary import Itinerary
from Models.place import Place, PlaceVisibility
from Models.trip import Trip
from Schemas.place_schema import PlacePublicSchema
from Schemas.base_schema import BaseSchema
from Schemas.day_schema import DaySchema, DayPublicSchema
from Services.Utils.route_distance import compute_total_miles


class ItinerarySchema(BaseSchema):
    # name is load_default=None; the service resolves it from trip.destination when absent
    name = fields.String(load_default=None, allow_none=True)
    description = fields.String(load_default=None, allow_none=True)
    difficulty = fields.Enum(
        DifficultyType, by_value=True, allow_none=True, load_default=None
    )
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
        for key in ('name', 'description'):
            if key in data and data[key] is not None:
                data[key] = bleach.clean(str(data[key]).strip(), tags=[], strip=True)
        return data

    @validates('name')
    def validate_name(self, value, **kwargs):
        if value is not None and len(value) > 255:
            raise ValidationError("Name cannot exceed 255 characters")

    @validates('description')
    def validate_description(self, value, **kwargs):
        if value is not None and len(value) > 2000:
            raise ValidationError("Description cannot exceed 2000 characters")

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
    description = fields.String(allow_none=True)
    difficulty = fields.Enum(DifficultyType, by_value=True, allow_none=True)
    is_public = fields.Boolean()
    avg_speed_knots = fields.Float()
    trip_id = fields.UUID(allow_none=True)

    @pre_load
    def sanitize_text_fields(self, data, **kwargs):
        for key in ('name', 'description'):
            if key in data and data[key] is not None:
                data[key] = bleach.clean(str(data[key]).strip(), tags=[], strip=True)
        return data

    @validates('name')
    def validate_name(self, value, **kwargs):
        if value is not None and len(value) > 255:
            raise ValidationError("Name cannot exceed 255 characters")

    @validates('description')
    def validate_description(self, value, **kwargs):
        if value is not None and len(value) > 2000:
            raise ValidationError("Description cannot exceed 2000 characters")

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
    # Clamped, not hidden, on the card (M19 decision 9) — the frontend line-clamps it.
    description = fields.String(dump_only=True, allow_none=True)
    # Plain string, not fields.Enum: this schema is fed snake_case dicts, so the
    # service emits difficulty.value the same way it emits `season`.
    difficulty = fields.String(dump_only=True, allow_none=True)
    total_miles = fields.Float(dump_only=True, allow_none=True)
    day_count = fields.Integer(dump_only=True)
    season = fields.String(dump_only=True, allow_none=True)
    centroid_lat = fields.Float(dump_only=True, allow_none=True)
    centroid_lng = fields.Float(dump_only=True, allow_none=True)
    # Simplified [lat, lng] pairs for the card thumbnail polyline — deliberately
    # not the full RouteData shape, so listing rows never trigger a per-card
    # route-detail fetch just to draw a preview.
    preview_positions = fields.List(
        fields.List(fields.Float), dump_only=True, dump_default=list
    )
    created_from_id = fields.UUID(dump_only=True, allow_none=True)
    original_author = fields.Nested(
        OriginalAuthorSchema, dump_only=True, allow_none=True
    )
    # M23 §3 — signals derivable without an author writing anything, which is what the
    # library needs: its routes have null description and null difficulty in practice.
    #
    # `author` is who wrote THIS route, and is distinct from `original_author` (who wrote
    # the route a fork came from). Same projection, since both feed the same card and
    # both must respect profile_is_public before linking.
    author = fields.Nested(OriginalAuthorSchema, dump_only=True, allow_none=True)
    # The hardest day, not the average — the closest stand-in for the missing difficulty.
    longest_day_miles = fields.Float(dump_only=True, allow_none=True)
    point_count = fields.Integer(dump_only=True, dump_default=0)
    # Public places and public photos only: the card is an anonymous surface, so a count
    # a visitor cannot then see would misrepresent how annotated the route is.
    place_count = fields.Integer(dump_only=True, dump_default=0)
    photo_count = fields.Integer(dump_only=True, dump_default=0)


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
    description = fields.String(dump_only=True, allow_none=True)
    difficulty = fields.Enum(
        DifficultyType, by_value=True, dump_only=True, allow_none=True
    )
    is_public = fields.Boolean(dump_only=True)
    avg_speed_knots = fields.Float(dump_only=True)
    total_miles = fields.Method("get_total_miles", dump_only=True)
    created_from_id = fields.UUID(dump_only=True, allow_none=True)
    original_author = fields.Nested(
        OriginalAuthorSchema, dump_only=True, allow_none=True
    )
    days = fields.List(fields.Nested(DayPublicSchema), dump_only=True)
    # Only the author's own PUBLIC places (M19 §4). This is not the deferred community
    # gazetteer: these belong to one itinerary and are published with it, so there is
    # no shared object, no dedup and no moderation queue.
    places = fields.Method("get_public_places", dump_only=True)
    trip_state = fields.Method("get_trip_state", dump_only=True)

    def get_public_places(self, itinerary: Itinerary) -> list:
        # Queried rather than reached through a relationship: Place.itinerary_id
        # already carries ondelete="CASCADE", and adding an ORM relationship without
        # passive_deletes would have SQLAlchemy null the children before deleting the
        # parent — the asymmetric-cascade shape M16 found three real bugs in. Same
        # session-query approach get_trip_state already uses here.
        places = (
            db.session.query(Place)
            .filter(
                Place.itinerary_id == itinerary.id,
                Place.visibility == PlaceVisibility.PUBLIC,
            )
            .order_by(Place.created)
            .all()
        )
        return PlacePublicSchema(many=True).dump(places)

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
