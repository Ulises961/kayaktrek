"""The route's dedicated sync channel — deliberately outside
pullChanges/pushChanges (Services/mobile_sync_service.py).

Why separate: the route is the one aggregate whose correctness is global
(docs/mobile/sync-protocol-spec.md §7.1) — a per-record delta cannot hold a
linked-list invariant. So it syncs as one atomic subtree (§4), the device
never sees `next_id` (only the order_key column, §7.2), and a parked
conflict here must never wedge check-in or float-plan sync behind it (§8.2)
— which is exactly why this is its own channel rather than a table entry in
pushChanges.

Two write paths, same underlying apply:
- `push_route`: the ordinary case. Rejects with a version mismatch (409) if
  the device's base route_version is stale — detected mechanically (§8.1),
  never silently merged.
- `resolve_route`: the human-adjudicated case (§8.4). Same apply, but skips
  the version check — the one path allowed to accept a mismatched point set,
  because a human just looked at both variants and chose. `point-order`
  (Services.itinerary_service.set_point_order) keeps its own 409 for the
  ordinary reorder case; this is not that endpoint.
"""
import logging
from datetime import date as _date
from uuid import UUID

from sqlalchemy.exc import NoResultFound

from Api.database import db
from Models.itinerary import Itinerary
from Models.point import Point, PointType
from Services.Utils.point_ordering import assign_order_keys, bump_route_version, chain_from_order_keys, walk_linked_list

logger = logging.getLogger(__name__)


class RouteVersionMismatchError(Exception):
    """Raised when a push's baseRouteVersion no longer matches the server's —
    the device's route has diverged from another device's or the web's edits.
    See §8.1/§8.2: detected mechanically, resolved by a human via
    `RouteSyncService.resolve_route`, never auto-merged."""


class RouteSyncService:
    @staticmethod
    def _get_itinerary_for_trip(trip_id: str) -> Itinerary:
        itinerary = (
            db.session.query(Itinerary).filter_by(trip_id=UUID(trip_id)).one_or_none()
        )
        if itinerary is None:
            raise NoResultFound(f"No itinerary for trip {trip_id}")
        return itinerary

    @staticmethod
    def pull_route(trip_id: str) -> dict:
        itinerary = RouteSyncService._get_itinerary_for_trip(trip_id)
        days = list(itinerary.days or [])
        points = [point for day in days for point in (day.points or [])]

        ordered_ids = walk_linked_list(points)
        by_id = {str(point.id): point for point in points}
        assign_order_keys([by_id[point_id] for point_id in ordered_ids])
        # Orphaned points (no head reachable, e.g. mid-corruption) still need a
        # key so the device doesn't silently drop them — appended after the
        # main chain in id order, same fallback walk_linked_list itself uses.
        unordered = [p for p in points if str(p.id) not in set(ordered_ids)]
        if unordered:
            assign_order_keys(sorted(unordered, key=lambda p: str(p.id)))
        db.session.commit()

        return {
            "routeVersion": itinerary.route_version,
            "days": [
                {
                    "id": str(day.id),
                    "dayNumber": day.day_number,
                    "date": day.date.isoformat() if day.date else None,
                    "startPointId": str(day.start_point_id) if day.start_point_id else None,
                    "endPointId": str(day.end_point_id) if day.end_point_id else None,
                }
                for day in days
            ],
            "points": [
                {
                    "id": str(point.id),
                    "dayId": str(point.day_id) if point.day_id else None,
                    "orderKey": point.order_key,
                    "latitude": float(point.latitude) if point.latitude is not None else None,
                    "longitude": float(point.longitude) if point.longitude is not None else None,
                    "name": point.name,
                    "notes": point.notes,
                    "type": point.type.value if point.type else None,
                }
                for point in points
            ],
        }

    @staticmethod
    def push_route(trip_id: str, base_route_version: int, days: list, points: list) -> dict:
        itinerary = RouteSyncService._get_itinerary_for_trip(trip_id)
        if base_route_version != itinerary.route_version:
            raise RouteVersionMismatchError(
                f"Route has diverged: base {base_route_version}, current {itinerary.route_version}"
            )
        return RouteSyncService._apply_replace(itinerary, days, points)

    @staticmethod
    def resolve_route(trip_id: str, days: list, points: list) -> dict:
        """The one path allowed to accept a mismatched point set — a human just
        adjudicated the conflict (§8.4). Applied as a command, not a merge."""
        itinerary = RouteSyncService._get_itinerary_for_trip(trip_id)
        return RouteSyncService._apply_replace(itinerary, days, points)

    @staticmethod
    def _apply_replace(itinerary: Itinerary, days: list, points: list) -> dict:
        existing_days = {str(day.id): day for day in (itinerary.days or [])}
        existing_points = {
            str(point.id): point
            for day in existing_days.values()
            for point in (day.points or [])
        }

        # Day removal is not this channel's job (day CRUD stays on the ordinary
        # day endpoints) — only days present in the payload get their mutable
        # fields and boundaries touched; everything else is left alone.
        for day_data in days:
            day_id = str(day_data["id"])
            day = existing_days.get(day_id)
            if day is None:
                raise ValueError(f"Day {day_id} does not belong to this itinerary")
            if "dayNumber" in day_data:
                day.day_number = day_data["dayNumber"]
            if "date" in day_data:
                value = day_data["date"]
                day.date = _date.fromisoformat(value) if isinstance(value, str) else value

        submitted_point_ids = {str(p["id"]) for p in points}
        for existing_point_id, existing_point in existing_points.items():
            if existing_point_id not in submitted_point_ids:
                db.session.delete(existing_point)

        by_id = {}
        for point_data in points:
            point_id = str(point_data["id"])
            point = existing_points.get(point_id)
            if point is None:
                point = Point(id=UUID(point_id))
                db.session.add(point)
            if "dayId" in point_data and point_data["dayId"]:
                day_id = str(point_data["dayId"])
                if day_id not in existing_days:
                    # Never trust a device-supplied dayId at face value — without
                    # this check a point could be redirected into another trip's
                    # day the caller merely knows or guessed the id of.
                    raise ValueError(f"Day {day_id} does not belong to this itinerary")
                point.day_id = UUID(day_id)
            if "latitude" in point_data:
                point.latitude = point_data["latitude"]
            if "longitude" in point_data:
                point.longitude = point_data["longitude"]
            if "name" in point_data:
                point.name = point_data["name"]
            if "notes" in point_data:
                point.notes = point_data["notes"]
            if "type" in point_data and point_data["type"]:
                point.type = PointType(point_data["type"])
            point.order_key = point_data.get("orderKey")
            by_id[point_id] = point

        db.session.flush()
        chain_from_order_keys(list(by_id.values()))

        for day_data in days:
            day = existing_days[str(day_data["id"])]
            day.start_point_id = UUID(day_data["startPointId"]) if day_data.get("startPointId") else None
            day.end_point_id = UUID(day_data["endPointId"]) if day_data.get("endPointId") else None

        bump_route_version(itinerary)
        db.session.commit()
        db.session.refresh(itinerary)

        logger.info(
            "route_sync_applied",
            extra={"itinerary_id": str(itinerary.id), "route_version": itinerary.route_version},
        )
        return {"routeVersion": itinerary.route_version}
