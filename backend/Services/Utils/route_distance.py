from typing import Iterable

from Services.Utils.geo_utils import haversine_nm
from Services.Utils.point_ordering import walk_linked_list


def compute_total_miles(days: Iterable) -> float:
    """Total paddle distance across an itinerary's numbered days, in nautical miles.

    `Itinerary.total_miles` is never written to after creation, so it cannot be
    trusted as a stored aggregate — this walks the route's own points in linked-list
    order instead, mirroring the frontend's client-side calc in
    `lib/itinerary/distance.ts` (one source of truth, computed on read everywhere).
    """
    points = [
        point
        for day in days
        if getattr(day, "day_number", None) != 0
        for point in (day.points or [])
    ]
    if not points:
        return 0.0

    point_map = {str(p.id): p for p in points}
    ordered = [point_map[pid] for pid in walk_linked_list(points)]
    placed = [p for p in ordered if p.latitude is not None and p.longitude is not None]

    total = 0.0
    for a, b in zip(placed, placed[1:]):
        total += haversine_nm(float(a.latitude), float(a.longitude), float(b.latitude), float(b.longitude))
    return total
