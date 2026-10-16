"""Itinerary Service — business logic for itinerary operations."""
import logging
import math
import secrets
from typing import Dict, List, Optional, Set, Tuple
from uuid import UUID

import bleach
import defusedxml.ElementTree
import gpxpy
import gpxpy.gpx
from sqlalchemy import and_, func, or_, select
from sqlalchemy.exc import NoResultFound, IntegrityError
from sqlalchemy.orm import selectinload

from Api.database import db
from Models.day import Day
from Models.difficulty import DifficultyType, VALID_DIFFICULTIES
from Models.itinerary import Itinerary
from Models.place import Place, PlaceVisibility
from Models.point import Point, PointType
from Models.trip import Trip
from Models.user import User
from Schemas.day_schema import DaySchema
from Schemas.itinerary_schema import ItinerarySchema, ItineraryUpdateSchema
from Services.Utils.point_ordering import bump_route_version, chain_in_order, walk_linked_list
from Services.Utils.rdp import rdp_simplify
from Services.Utils.route_distance import compute_day_miles, compute_total_miles
from Services.Utils.seasons import VALID_SEASONS, season_months, season_of

logger = logging.getLogger(__name__)

_DEFAULT_SPEED = 2.5
_GPX_IMPORT_MAX_BYTES = 5 * 1024 * 1024  # 5 MB
_GPX_DEFAULT_EPSILON = 0.0001  # degrees (~11 m)


class PointOrderMismatchError(Exception):
    """The submitted route order is not a permutation of the itinerary's points.

    A 409, not a 400: the request is well-formed, it is the client's picture of the
    route that has gone stale. Re-chaining anyway would orphan whatever it left out
    — and an orphaned point falls back to `walk_linked_list`'s head sort, where
    UUIDv7 ties on the millisecond let the random bits decide the route's shape.
    The client refetches and resubmits; route editing is single-editor (only the
    leader), so this is rare by construction.
    """


class ItineraryService:
    _MUTABLE_FIELDS = frozenset(
        {"name", "description", "difficulty", "is_public", "avg_speed_knots", "trip_id"}
    )

    # ------------------------------------------------------------------ #
    # Read                                                                  #
    # ------------------------------------------------------------------ #

    @staticmethod
    def get_itinerary_by_id(itinerary_id: str) -> Itinerary:
        itinerary = (
            db.session.query(Itinerary)
            .options(selectinload(Itinerary.days).selectinload(Day.points))
            .filter_by(id=UUID(itinerary_id))
            .first()
        )
        if not itinerary:
            raise NoResultFound(f"Itinerary {itinerary_id} not found")
        return itinerary

    @staticmethod
    def get_trip_id(itinerary_id: str) -> Optional[UUID]:
        """The trip an itinerary belongs to, without loading its days and points."""
        return db.session.query(Itinerary.trip_id).filter_by(id=UUID(itinerary_id)).scalar()

    @staticmethod
    def get_itineraries_by_user(user_id: str) -> List[Itinerary]:
        """Return all itineraries owned by this user (user_id FK, not junction table)."""
        return (
            db.session.query(Itinerary)
            .options(selectinload(Itinerary.days).selectinload(Day.points))
            .filter_by(user_id=UUID(user_id))
            .all()
        )

    @staticmethod
    def get_public_itinerary(itinerary_id: str) -> Itinerary:
        """Return a public itinerary or raise NoResultFound if it is private."""
        itinerary = ItineraryService.get_itinerary_by_id(itinerary_id)
        if not itinerary.is_public:
            raise NoResultFound(f"Itinerary {itinerary_id} not found")
        return itinerary

    @staticmethod
    def generate_story_share(itinerary_id: str, user_id: str) -> Itinerary:
        """Generate (or regenerate) the unlisted story-share token.

        Any trip member with itinerary write access may share it (same access rule
        as editing the route itself — see require_owner('itinerary')). Regenerating
        immediately invalidates the previous link; there is no separate revoke.
        """
        itinerary = ItineraryService.get_itinerary_by_id(itinerary_id)
        itinerary.story_share_token = secrets.token_urlsafe(32)
        db.session.commit()
        return itinerary

    @staticmethod
    def get_story_by_token(token: str) -> Itinerary:
        """Return the itinerary for a valid story-share token.

        Raises NoResultFound on an unknown token — no distinction from "never
        shared" is surfaced, matching the float-plan token's no-oracle behavior.
        """
        itinerary = db.session.query(Itinerary).filter_by(story_share_token=token).first()
        if not itinerary:
            raise NoResultFound("Story not found")
        return itinerary

    @staticmethod
    def get_public_itineraries() -> List[Itinerary]:
        """Return all public itineraries for the /explore listing."""
        return db.session.query(Itinerary).filter_by(is_public=True).all()

    @staticmethod
    def search_public_itineraries(
        *,
        page: int = 1,
        per_page: int = 20,
        min_lat: Optional[float] = None,
        min_lng: Optional[float] = None,
        max_lat: Optional[float] = None,
        max_lng: Optional[float] = None,
        seasons: Optional[List[str]] = None,
        difficulties: Optional[List[str]] = None,
        min_miles: Optional[float] = None,
        max_miles: Optional[float] = None,
        min_days: Optional[int] = None,
        max_days: Optional[int] = None,
        name: Optional[str] = None,
        sort: str = "recent",
    ) -> dict:
        """Paginated, filterable public-route discovery for the /explore library.

        All discovery facets are derived from data the itinerary already owns and
        already exposes publicly (route points + day dates) — never from the private
        Trip. Filters are correlated subqueries so the paginated base query stays one
        row per itinerary. Returns {"items", "total", "page", "pages"}.
        """
        page = max(1, page)
        per_page = max(1, min(per_page, 100))

        # Numbered days only (day_number 0 is the staging day).
        day_count_sq = (
            select(func.count(Day.id))
            .where(Day.itinerary_id == Itinerary.id, Day.day_number != 0)
            .correlate(Itinerary)
            .scalar_subquery()
        )
        # Representative latitude → hemisphere for the season mapping.
        avg_lat_sq = (
            select(func.avg(Point.latitude))
            .select_from(Point)
            .join(Day, Point.day_id == Day.id)
            .where(
                Day.itinerary_id == Itinerary.id,
                Day.day_number != 0,
                Point.latitude.isnot(None),
            )
            .correlate(Itinerary)
            .scalar_subquery()
        )

        base = db.session.query(Itinerary).filter(Itinerary.is_public.is_(True))

        if name and name.strip():
            base = base.filter(Itinerary.name.ilike(f"%{name.strip()}%"))
        if difficulties:
            # Unknown values are dropped rather than 400ing — the same tolerance the
            # season facet applies, so a stale bookmark still returns a usable page.
            selected = [
                DifficultyType(value)
                for value in difficulties
                if value in VALID_DIFFICULTIES
            ]
            if selected:
                base = base.filter(Itinerary.difficulty.in_(selected))
        if min_days is not None:
            base = base.filter(day_count_sq >= min_days)
        if max_days is not None:
            base = base.filter(day_count_sq <= max_days)

        # Viewport bbox (axis-aligned lat/lng box — all four bounds required):
        # EXISTS a numbered-day point inside the box. Plain numeric comparison on
        # latitude/longitude; the PostGIS geo column is only needed for radius queries.
        if None not in (min_lat, min_lng, max_lat, max_lng):
            bbox_exists = (
                select(Point.id)
                .select_from(Point)
                .join(Day, Point.day_id == Day.id)
                .where(
                    Day.itinerary_id == Itinerary.id,
                    Day.day_number != 0,
                    Point.latitude.isnot(None),
                    Point.longitude.isnot(None),
                    Point.latitude >= min_lat,
                    Point.latitude <= max_lat,
                    Point.longitude >= min_lng,
                    Point.longitude <= max_lng,
                )
                .correlate(Itinerary)
                .exists()
            )
            base = base.filter(bbox_exists)

        # Season (hemisphere-aware). A route matches if any dated numbered day falls in
        # the requested season for its hemisphere. Routes with no dated days have an
        # unknown season → treated as a wildcard (still shown) so undated planning
        # templates are not hidden from discovery.
        season_tokens = [
            token
            for token in (seasons or [])
            if str(token).strip().lower() in VALID_SEASONS
        ]
        if season_tokens:
            months_north = sorted(season_months(season_tokens, 1))
            months_south = sorted(season_months(season_tokens, -1))
            dated_days = select(Day.id).where(
                Day.itinerary_id == Itinerary.id,
                Day.day_number != 0,
                Day.date.isnot(None),
            ).correlate(Itinerary)
            season_match = dated_days.where(
                or_(
                    and_(
                        avg_lat_sq >= 0,
                        func.extract("month", Day.date).in_(months_north),
                    ),
                    and_(
                        avg_lat_sq < 0,
                        func.extract("month", Day.date).in_(months_south),
                    ),
                )
            ).exists()
            has_any_dated_day = dated_days.exists()
            base = base.filter(or_(season_match, ~has_any_dated_day))

        # total_miles is derived on read (see compute_total_miles) — there is no stored
        # column to filter or sort by, so a miles filter or a distance sort requires
        # loading every SQL-filtered candidate and scoring it in Python before paging.
        if min_miles is not None or max_miles is not None or sort == "distance":
            candidates = base.options(
                selectinload(Itinerary.days).selectinload(Day.points)
            ).all()
            scored = [(it, ItineraryService.compute_total_miles(it)) for it in candidates]
            if min_miles is not None:
                scored = [(it, m) for it, m in scored if m >= min_miles]
            if max_miles is not None:
                scored = [(it, m) for it, m in scored if m <= max_miles]
            if sort == "distance":
                scored.sort(key=lambda pair: pair[1])
            elif sort == "duration":
                scored.sort(
                    key=lambda pair: sum(1 for d in pair[0].days if d.day_number != 0)
                )
            elif sort == "name":
                scored.sort(key=lambda pair: (pair[0].name or "").lower())
            else:  # recent — UUIDv7 ids are time-ordered
                scored.sort(key=lambda pair: str(pair[0].id), reverse=True)
            total = len(scored)
            start = (page - 1) * per_page
            itineraries = [it for it, _ in scored[start: start + per_page]]
        else:
            total = base.count()
            if sort == "duration":
                base = base.order_by(day_count_sq.asc())
            elif sort == "name":
                base = base.order_by(Itinerary.name.asc())
            else:  # recent — UUIDv7 ids are time-ordered
                base = base.order_by(Itinerary.id.desc())
            itineraries = (
                base.options(selectinload(Itinerary.days).selectinload(Day.points))
                .offset((page - 1) * per_page)
                .limit(per_page)
                .all()
            )

        items = ItineraryService._annotate_explore_items(itineraries)
        pages = math.ceil(total / per_page) if total > 0 else 1
        logger.info(
            "public_itineraries_searched", extra={"total": total, "page": page}
        )
        return {"items": items, "total": total, "page": page, "pages": pages}

    # Explore-card thumbnails draw a single polyline, so the preview geometry is
    # deliberately coarse: RDP at ~110 m tolerance, then a hard cap so one very
    # dense route can't bloat the listing payload.
    _PREVIEW_EPSILON = 0.001  # degrees
    _PREVIEW_MAX_POINTS = 60

    @staticmethod
    def _preview_positions(numbered_days: List[Day]) -> List[List[float]]:
        """Ordered, simplified [lat, lng] pairs for a route's listing thumbnail.

        Walks each day's own chain in day_number order (same per-day walk as
        compute_total_miles — a single global walk is non-deterministic across
        disconnected day chains), then simplifies. Listing rows never need the
        full RouteData shape — this is thumbnail geometry only.
        """
        ordered: List[Point] = []
        for day in sorted(numbered_days, key=lambda d: d.day_number):
            day_points = day.points or []
            point_map = {str(p.id): p for p in day_points}
            ordered.extend(point_map[pid] for pid in walk_linked_list(day_points))
        placed = [
            (float(p.latitude), float(p.longitude))
            for p in ordered
            if p.latitude is not None and p.longitude is not None
        ]
        simplified = rdp_simplify(placed, ItineraryService._PREVIEW_EPSILON)
        cap = ItineraryService._PREVIEW_MAX_POINTS
        if len(simplified) > cap:
            step = (len(simplified) - 1) / (cap - 1)
            simplified = [simplified[round(i * step)] for i in range(cap)]
        return [[lat, lng] for lat, lng in simplified]

    @staticmethod
    def _annotate_explore_items(itineraries: List[Itinerary]) -> List[dict]:
        """Derive each page row's facets + fork attribution (mirrors the two-phase
        annotate step in UserService.search_paddlers)."""
        items: List[dict] = []
        source_ids: Set[UUID] = set()
        for itinerary in itineraries:
            numbered = [
                day for day in (itinerary.days or []) if day.day_number != 0
            ]
            lats = [
                float(point.latitude)
                for day in numbered
                for point in (day.points or [])
                if point.latitude is not None
            ]
            lngs = [
                float(point.longitude)
                for day in numbered
                for point in (day.points or [])
                if point.longitude is not None
            ]
            centroid_lat = sum(lats) / len(lats) if lats else None
            centroid_lng = sum(lngs) / len(lngs) if lngs else None
            dated = sorted(day.date for day in numbered if day.date is not None)
            season = (
                season_of(dated[0].month, centroid_lat if centroid_lat is not None else 0)
                if dated
                else None
            )
            if itinerary.created_from_id is not None:
                source_ids.add(itinerary.created_from_id)
            day_miles = compute_day_miles(itinerary.days or [])
            points = [point for day in numbered for point in (day.points or [])]
            items.append(
                {
                    "id": str(itinerary.id),
                    "name": itinerary.name,
                    # The closest available stand-in for `difficulty`, which is null on
                    # every route in the library — an even split of the total says
                    # nothing about whether one day is a slog.
                    "longest_day_miles": max(day_miles.values()) if day_miles else None,
                    "point_count": len(points),
                    "photo_count": sum(
                        1 for point in points for image in (point.images or []) if image.is_public
                    ),
                    "_owner_id": itinerary.user_id,
                    "author": None,
                    "place_count": 0,
                    "description": itinerary.description,
                    "difficulty": (
                        itinerary.difficulty.value
                        if itinerary.difficulty is not None
                        else None
                    ),
                    "total_miles": ItineraryService.compute_total_miles(itinerary),
                    "day_count": len(numbered),
                    "season": season,
                    "centroid_lat": centroid_lat,
                    "centroid_lng": centroid_lng,
                    "preview_positions": ItineraryService._preview_positions(numbered),
                    "created_from_id": (
                        str(itinerary.created_from_id)
                        if itinerary.created_from_id is not None
                        else None
                    ),
                    "_source_id": itinerary.created_from_id,
                    "original_author": None,
                }
            )

        authors = ItineraryService._authors_for_sources(source_ids)
        # Batched for the whole page, the way fork authors already are — /explore is the
        # app's most public endpoint and a per-row query would scale with page size.
        owners = ItineraryService._authors_for_users(
            {item["_owner_id"] for item in items if item["_owner_id"] is not None}
        )
        place_counts = ItineraryService._public_place_counts(
            [UUID(item["id"]) for item in items]
        )
        for item in items:
            source_id = item.pop("_source_id")
            if source_id is not None:
                item["original_author"] = authors.get(source_id)
            owner_id = item.pop("_owner_id")
            if owner_id is not None:
                item["author"] = owners.get(owner_id)
            item["place_count"] = place_counts.get(UUID(item["id"]), 0)
        return items

    @staticmethod
    def _authors_for_users(user_ids: Set[UUID]) -> Dict[UUID, dict]:
        """Batch-resolve users to the same author projection forks already use.

        Separate from `_authors_for_sources` because that one keys by *itinerary* id
        (the route a fork came from); this keys by user id (who wrote this route).
        `linkable` mirrors profile_is_public so a card never deep-links a private profile.
        """
        if not user_ids:
            return {}
        rows = (
            db.session.query(User.id, User.username, User.name, User.profile_is_public)
            .filter(User.id.in_(user_ids))
            .all()
        )
        return {
            user_id: {"username": username, "name": name, "linkable": bool(is_public)}
            for user_id, username, name, is_public in rows
        }

    @staticmethod
    def _public_place_counts(itinerary_ids: List[UUID]) -> Dict[UUID, int]:
        """How many PUBLIC places each itinerary carries, in one grouped query.

        Private places are excluded: the card is an anonymous surface, and advertising a
        count a visitor cannot then see would be a lie about how annotated the route is.
        """
        if not itinerary_ids:
            return {}
        rows = (
            db.session.query(Place.itinerary_id, func.count(Place.id))
            .filter(
                Place.itinerary_id.in_(itinerary_ids),
                Place.visibility == PlaceVisibility.PUBLIC,
            )
            .group_by(Place.itinerary_id)
            .all()
        )
        return {itinerary_id: count for itinerary_id, count in rows}

    @staticmethod
    def _authors_for_sources(source_ids: Set[UUID]) -> Dict[UUID, dict]:
        """Batch-resolve fork-source itineraries to their author projection.

        Returns {source_itinerary_id: {username, name, linkable}}. `linkable` mirrors
        the author's profile_is_public so the frontend never deep-links a private
        profile. Trip data is never touched.
        """
        if not source_ids:
            return {}
        rows = (
            db.session.query(
                Itinerary.id, User.username, User.name, User.profile_is_public
            )
            .join(User, Itinerary.user_id == User.id)
            .filter(Itinerary.id.in_(source_ids))
            .all()
        )
        return {
            source_id: {
                "username": username,
                "name": name,
                "linkable": bool(is_public),
            }
            for source_id, username, name, is_public in rows
        }

    @staticmethod
    def resolve_original_author(itinerary: Itinerary) -> Optional[dict]:
        """Author projection of the itinerary this one was forked from, or None.

        Used by the public detail endpoint to render "Cloned from {author}".
        """
        if itinerary.created_from_id is None:
            return None
        return ItineraryService._authors_for_sources(
            {itinerary.created_from_id}
        ).get(itinerary.created_from_id)

    # ------------------------------------------------------------------ #
    # Write                                                                 #
    # ------------------------------------------------------------------ #

    @staticmethod
    def ensure_staging_day(itinerary: Itinerary) -> Day:
        """Return the itinerary's Day 0, creating it if absent.

        Day 0 is the staging area every newly dropped point is assigned to before
        any day boundary owns it. An itinerary without one cannot accept a point
        at all, so every path that creates an Itinerary must run through here.
        Flushes but does not commit — the caller owns the transaction.
        """
        day0 = db.session.query(Day).filter_by(
            itinerary_id=itinerary.id, day_number=0
        ).first()
        if day0 is None:
            day0 = Day(day_number=0, itinerary_id=itinerary.id, date=None)
            db.session.add(day0)
            db.session.flush()
        return day0

    @staticmethod
    def provision_staging_day(itinerary_id: str) -> Day:
        """Return the itinerary's Day 0, committing a new one if it has none.

        The transactional sibling of ensure_staging_day, for callers that own no
        wider transaction. This is the repair path: every creation path is supposed
        to leave a Day 0 behind, and when one doesn't, the builder has no staging
        area and silently refuses every point the user drops. Idempotent.
        """
        itinerary = ItineraryService.get_itinerary_by_id(itinerary_id)
        day0 = ItineraryService.ensure_staging_day(itinerary)
        db.session.commit()
        return day0

    @staticmethod
    def create_itinerary(itinerary_data: dict, user_id: str) -> Itinerary:
        """Create a new itinerary.

        If name is absent or empty and a tripId is provided, the name is derived
        from the linked trip's destination. For standalone itineraries (no tripId)
        a name is required.
        """
        trip_id = itinerary_data.get("tripId")
        raw_name = (itinerary_data.get("name") or "").strip()
        raw_description = (itinerary_data.get("description") or "").strip()

        trip: Optional[Trip] = None
        if trip_id and not (raw_name and raw_description):
            trip = db.session.query(Trip).filter_by(id=UUID(trip_id)).first()
            if not trip:
                raise NoResultFound(f"Trip {trip_id} not found")

        if not raw_name:
            if trip is not None:
                itinerary_data = {**itinerary_data, "name": (trip.destination or "").strip()}
            else:
                raise ValueError("name is required for standalone itineraries")

        # Seed the route's public pitch from the trip's brief, once, at creation. A
        # copy and not a link: editing either afterwards leaves the other alone.
        if not raw_description and trip is not None and trip.description:
            itinerary_data = {**itinerary_data, "description": trip.description}

        itinerary = ItinerarySchema().load(itinerary_data)
        db.session.add(itinerary)
        db.session.flush()

        ItineraryService.ensure_staging_day(itinerary)
        db.session.commit()
        db.session.refresh(itinerary)

        logger.info("itinerary_created", extra={"itinerary_id": str(itinerary.id), "user_id": user_id})
        return itinerary

    @staticmethod
    def update_itinerary(itinerary_id: str, itinerary_data: dict, user_id: str) -> Itinerary:
        """Partially update an itinerary. Only whitelisted fields are applied.

        A public itinerary's route (its `days`, and therefore its points) is
        always read-only — fork it to change the path. Its pitch fields,
        `is_public` itself, `avg_speed_knots` and `trip_id` stay editable while
        public, but **only by its author** (`itinerary.user_id`): `@require_owner`
        also admits a trip member with no pitch-authoring role at all (the
        ownership hierarchy grants a trip member full itinerary access), and
        that person having trip access is not the same as having written the
        public listing — they haven't forked it, and shouldn't be able to edit
        or unpublish someone else's route just by being on the same trip.
        """
        itinerary = ItineraryService.get_itinerary_by_id(itinerary_id)

        if itinerary.is_public:
            if "days" in itinerary_data:
                raise PermissionError(
                    "A public itinerary's route is read-only. Fork it to change days or points."
                )
            if str(itinerary.user_id) != str(user_id):
                raise PermissionError(
                    "Only the author can edit a public itinerary's pitch or visibility."
                )

        validated: dict = ItineraryUpdateSchema().load(itinerary_data)

        for field in ItineraryService._MUTABLE_FIELDS:
            if field in validated:
                setattr(itinerary, field, validated[field])

        if "days" in itinerary_data:
            for day in list(itinerary.days):
                db.session.delete(day)
            db.session.flush()
            for day_data in (itinerary_data["days"] or []):
                day = DaySchema().load(day_data)
                day.itinerary_id = itinerary.id
                itinerary.days.append(day)

        db.session.commit()
        db.session.refresh(itinerary)

        logger.info("itinerary_updated", extra={"itinerary_id": itinerary_id})
        return itinerary

    @staticmethod
    def delete_itinerary(itinerary_id: str) -> None:
        itinerary = ItineraryService.get_itinerary_by_id(itinerary_id)
        try:
            db.session.delete(itinerary)
            db.session.commit()
            logger.info("itinerary_deleted", extra={"itinerary_id": itinerary_id})
        except IntegrityError as e:
            db.session.rollback()
            logger.error("itinerary_delete_integrity_error", extra={"itinerary_id": itinerary_id, "error": str(e)})
            raise

    # ------------------------------------------------------------------ #
    # Route order                                                           #
    # ------------------------------------------------------------------ #

    @staticmethod
    def itinerary_points(itinerary_id: str) -> List[Point]:
        """Every route point in the itinerary, staging day included."""
        return (
            db.session.query(Point)
            .join(Day, Point.day_id == Day.id)
            .filter(Day.itinerary_id == UUID(itinerary_id))
            .all()
        )

    @staticmethod
    def set_point_order(itinerary_id: str, order: List[str]) -> List[str]:
        """Rewrite the route's `next_id` chain to follow the given id order.

        `pointOrder` is the frontend's canonical route order; this is the verb that
        sends it back. It is deliberately general rather than insert-specific:
        reordering is the same operation.

        The submitted ids must be exactly the itinerary's own points, no more and
        no fewer (see PointOrderMismatchError).
        """
        itinerary = ItineraryService.get_itinerary_by_id(itinerary_id)
        points = ItineraryService.itinerary_points(itinerary_id)
        by_id = {str(point.id): point for point in points}

        submitted = [str(point_id) for point_id in order]
        if len(set(submitted)) != len(submitted) or set(submitted) != set(by_id):
            raise PointOrderMismatchError(
                "The submitted order does not match the itinerary's points"
            )

        chain_in_order([by_id[point_id] for point_id in submitted])
        bump_route_version(itinerary)
        db.session.commit()

        logger.info(
            "itinerary_point_order_set",
            extra={"itinerary_id": itinerary_id, "point_count": len(submitted)},
        )
        return submitted

    # ------------------------------------------------------------------ #
    # Fork                                                                  #
    # ------------------------------------------------------------------ #

    @staticmethod
    def fork_itinerary(source_id: str, user_id: str) -> Itinerary:
        """Create a private deep copy of a public itinerary owned by user_id."""
        source = ItineraryService.get_itinerary_by_id(source_id)
        if not source.is_public:
            raise PermissionError("Only public itineraries can be forked")
        if source.user_id == UUID(user_id):
            # The author already owns this route — cloning it would duplicate it in
            # their itineraries list. They should open the original instead.
            raise PermissionError("You already own this route")

        fork = Itinerary(
            name=source.name,
            # Route-describing fields travel with the route; the fork's own trip (if it
            # ever gets one) keeps its separate brief.
            description=source.description,
            difficulty=source.difficulty,
            is_public=False,
            avg_speed_knots=source.avg_speed_knots,
            user_id=UUID(user_id),
            created_from_id=source.id,
        )
        db.session.add(fork)
        db.session.flush()

        old_to_new_day: Dict[str, Day] = {}
        all_source_points: List[Point] = []

        for old_day in source.days:
            new_day = Day(
                day_number=old_day.day_number,
                date=old_day.date,
                itinerary_id=fork.id,
            )
            db.session.add(new_day)
            old_to_new_day[str(old_day.id)] = new_day
            if old_day.points:
                all_source_points.extend(old_day.points)

        db.session.flush()

        old_to_new_point: Dict[str, Point] = {}
        point_map: Dict[str, Point] = {str(p.id): p for p in all_source_points}

        for old_point in all_source_points:
            new_day = old_to_new_day[str(old_point.day_id)]
            new_point = Point(
                latitude=old_point.latitude,
                longitude=old_point.longitude,
                name=old_point.name,
                type=old_point.type,
                day_id=new_day.id,
            )
            if old_point.latitude is not None and old_point.longitude is not None:
                new_point.geo = f'SRID=4326;POINT({float(old_point.longitude)} {float(old_point.latitude)})'
            db.session.add(new_point)
            old_to_new_point[str(old_point.id)] = new_point

        db.session.flush()

        # Restore linked-list next_id references
        for old_id, new_point in old_to_new_point.items():
            old_next_id = point_map[old_id].next_id
            if old_next_id and str(old_next_id) in old_to_new_point:
                new_point.next_id = old_to_new_point[str(old_next_id)].id

        # Restore day boundary FK references
        for old_day in source.days:
            new_day = old_to_new_day[str(old_day.id)]
            if old_day.start_point_id and str(old_day.start_point_id) in old_to_new_point:
                new_day.start_point_id = old_to_new_point[str(old_day.start_point_id)].id
            if old_day.end_point_id and str(old_day.end_point_id) in old_to_new_point:
                new_day.end_point_id = old_to_new_point[str(old_day.end_point_id)].id

        # The copy above reproduces the source's days exactly — including the
        # absence of a Day 0, if the source never had one. A fork is a route the
        # user is expected to edit, and without the staging day every dropped point
        # has nowhere to land. Run it after the copy so a source that *did* carry a
        # Day 0 doesn't end up with two.
        ItineraryService.ensure_staging_day(fork)

        db.session.commit()
        db.session.refresh(fork)

        logger.info("itinerary_forked", extra={"source_id": source_id, "fork_id": str(fork.id), "user_id": user_id})
        return fork

    # ------------------------------------------------------------------ #
    # Batch boundaries                                                      #
    # ------------------------------------------------------------------ #

    @staticmethod
    def apply_boundaries(itinerary_id: str, boundaries: List[dict], point_updates: List[dict]) -> Itinerary:
        """Apply day boundaries in a single transaction.

        boundaries: [{ dayId, startPointId, endPointId, date }]
        point_updates: [{ id, type?, name? }]
        """
        itinerary = ItineraryService.get_itinerary_by_id(itinerary_id)

        all_points: List[Point] = [p for day in itinerary.days for p in (day.points or [])]
        # Also collect points whose day was deleted (day_id = NULL) by chasing
        # next_id chains forward from the known set.
        known_ids: Set[str] = {str(p.id) for p in all_points}
        to_chase: Set[str] = {
            str(p.next_id) for p in all_points
            if p.next_id and str(p.next_id) not in known_ids
        }
        while to_chase:
            extra: List[Point] = db.session.query(Point).filter(
                Point.id.in_([UUID(pid) for pid in to_chase])
            ).all()
            all_points.extend(extra)
            for p in extra:
                known_ids.add(str(p.id))
            to_chase = {
                str(p.next_id) for p in extra
                if p.next_id and str(p.next_id) not in known_ids
            }
        point_map: Dict[str, Point] = {str(p.id): p for p in all_points}

        point_order = ItineraryService._walk_linked_list(all_points)
        point_idx: Dict[str, int] = {pid: i for i, pid in enumerate(point_order)}

        old_boundary_ids: Set[str] = set()
        day0: Optional[Day] = None
        day_map: Dict[str, Day] = {}
        for day in itinerary.days:
            day_map[str(day.id)] = day
            if day.day_number == 0:
                day0 = day
                continue
            if day.start_point_id:
                old_boundary_ids.add(str(day.start_point_id))
            if day.end_point_id:
                old_boundary_ids.add(str(day.end_point_id))

        if day0 is None:
            raise ValueError("Itinerary has no staging day (Day 0)")

        point_to_day: Dict[str, UUID] = {pid: day0.id for pid in point_order}
        new_boundary_ids: Set[str] = set()

        for boundary in boundaries:
            day_id_str = str(boundary["dayId"])
            start_pid = str(boundary["startPointId"])
            end_pid = str(boundary["endPointId"])

            if start_pid not in point_idx or end_pid not in point_idx:
                raise ValueError("Boundary point not found in itinerary linked list")

            start_i = point_idx[start_pid]
            end_i = point_idx[end_pid]

            boundary_day: Optional[Day] = day_map.get(day_id_str)
            if boundary_day is None:
                raise ValueError(f"Day {day_id_str} does not belong to this itinerary")

            for point_id in point_order[start_i: end_i + 1]:
                point_to_day[point_id] = boundary_day.id

            boundary_day.start_point_id = UUID(start_pid)
            boundary_day.end_point_id = UUID(end_pid)
            if boundary.get("date"):
                boundary_day.date = boundary["date"]

            new_boundary_ids.add(start_pid)
            new_boundary_ids.add(end_pid)

        # Days absent from the payload are now empty — clear their boundary FKs.
        received_day_ids = {str(b["dayId"]) for b in boundaries}
        for day_id_str, day in day_map.items():
            if day.day_number == 0:
                continue
            if day_id_str not in received_day_ids:
                day.start_point_id = None
                day.end_point_id = None

        update_map: Dict[str, dict] = {str(u["id"]): u for u in point_updates}

        for pid, point in point_map.items():
            point.day_id = point_to_day.get(pid, day0.id)

            # Type resolution: boundary → stop; de-boundaried → position; explicit override wins last
            if pid in new_boundary_ids:
                point.type = PointType.STOP
            elif pid in old_boundary_ids:
                point.type = PointType.POSITION

            if pid in update_map:
                upd = update_map[pid]
                if "type" in upd:
                    point.type = PointType(upd["type"])
                if "name" in upd and upd["name"] is not None:
                    point.name = bleach.clean(str(upd["name"]).strip(), tags=[], strip=True)

        bump_route_version(itinerary)
        db.session.commit()
        db.session.refresh(itinerary)

        logger.info("boundaries_applied", extra={"itinerary_id": itinerary_id, "day_count": len(boundaries)})
        return itinerary

    # ------------------------------------------------------------------ #
    # GPX export                                                            #
    # ------------------------------------------------------------------ #

    @staticmethod
    def export_gpx(itinerary_id: str, include_private: bool = True) -> bytes:
        """Return GPX bytes.

        include_private=False strips point notes (used for unauthenticated export).
        """
        itinerary = ItineraryService.get_itinerary_by_id(itinerary_id)
        all_points: List[Point] = [p for day in itinerary.days for p in (day.points or [])]
        point_order = ItineraryService._walk_linked_list(all_points)
        point_map: Dict[str, Point] = {str(p.id): p for p in all_points}

        point_to_day_number: Dict[str, int] = {}
        for day in itinerary.days:
            for point_in_day in (day.points or []):
                point_to_day_number[str(point_in_day.id)] = day.day_number

        gpx = gpxpy.gpx.GPX()
        gpx.name = itinerary.name
        route = gpxpy.gpx.GPXRoute()
        route.name = itinerary.name
        gpx.routes.append(route)

        for point_id in point_order:
            point: Optional[Point] = point_map.get(point_id)
            if point is None or point.latitude is None or point.longitude is None:
                continue
            route_point = gpxpy.gpx.GPXRoutePoint(
                latitude=float(point.latitude),
                longitude=float(point.longitude),
                name=point.name or "",
            )
            route_point.symbol = point.type.value if point.type else "position"
            day_number = point_to_day_number.get(point_id, 0)
            route_point.comment = f"Day {day_number}" if day_number > 0 else "Staging"
            if include_private and point.notes:
                route_point.description = point.notes
            route.points.append(route_point)

        return gpx.to_xml().encode("utf-8")

    # ------------------------------------------------------------------ #
    # GPX import                                                            #
    # ------------------------------------------------------------------ #

    @staticmethod
    def import_gpx(
        file_bytes: bytes,
        filename: str,
        user_id: str,
        epsilon: float = _GPX_DEFAULT_EPSILON,
    ) -> Itinerary:
        """Parse a GPX file and create a new itinerary with all points in Day 0."""
        if len(file_bytes) > _GPX_IMPORT_MAX_BYTES:
            raise ValueError("GPX file exceeds the 5 MB limit")

        try:
            defusedxml.ElementTree.fromstring(file_bytes)
            gpx = gpxpy.parse(file_bytes.decode('utf-8'))
        except Exception as exc:
            raise ValueError(f"Invalid GPX file: {exc}") from exc

        base_name = filename[:-4] if filename.lower().endswith(".gpx") else filename
        itinerary_name = bleach.clean(
            (gpx.name or base_name or "Imported route").strip(), tags=[], strip=True
        )

        raw_points: List[Tuple[float, float, str]] = []

        for route in gpx.routes:
            for rp in route.points:
                raw_points.append((rp.latitude, rp.longitude, rp.name or ""))

        if not raw_points:
            for track in gpx.tracks:
                for segment in track.segments:
                    coords: List[Tuple[float, float]] = [
                        (tp.latitude, tp.longitude) for tp in segment.points
                    ]
                    for lat, lon in rdp_simplify(coords, epsilon):
                        raw_points.append((lat, lon, ""))

        if not raw_points:
            raise ValueError("GPX file contains no routes or tracks")

        itinerary = Itinerary(
            name=itinerary_name,
            is_public=False,
            avg_speed_knots=_DEFAULT_SPEED,
            user_id=UUID(user_id),
        )
        db.session.add(itinerary)
        db.session.flush()

        day0 = ItineraryService.ensure_staging_day(itinerary)

        prev_point: Optional[Point] = None
        for lat, lon, name in raw_points:
            p = Point(
                latitude=lat,
                longitude=lon,
                name=name or None,
                type=PointType.POSITION,
                day_id=day0.id,
            )
            p.geo = f'SRID=4326;POINT({float(lon)} {float(lat)})'
            db.session.add(p)
            db.session.flush()
            if prev_point is not None:
                prev_point.next_id = p.id
            prev_point = p

        db.session.commit()
        db.session.refresh(itinerary)

        logger.info(
            "itinerary_imported",
            extra={"itinerary_id": str(itinerary.id), "user_id": user_id, "point_count": len(raw_points)},
        )
        return itinerary

    # ------------------------------------------------------------------ #
    # Internal helpers                                                      #
    # ------------------------------------------------------------------ #

    @staticmethod
    def _walk_linked_list(points: List[Point]) -> List[str]:
        """Return point IDs in linked-list order, walking all disconnected chains.

        UUID v7 IDs sort lexicographically by creation time, so sorting heads by
        str(id) gives a stable, deterministic order for orphaned chains.
        """
        return walk_linked_list(points)

    @staticmethod
    def compute_total_miles(itinerary: Itinerary) -> float:
        """Total paddle distance across the itinerary's numbered days, computed on read.

        See `Services.Utils.route_distance` — `Itinerary.total_miles` is never
        written to after creation and cannot be trusted as a stored aggregate.
        """
        return compute_total_miles(itinerary.days or [])
