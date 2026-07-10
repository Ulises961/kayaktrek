from typing import Iterable

from Services.Utils.geo_utils import haversine_nm
from Services.Utils.point_ordering import walk_linked_list


def compute_total_miles(days: Iterable) -> float:
    """Total paddle distance across an itinerary's numbered days, in nautical miles.

    `Itinerary.total_miles` is never written to after creation, so it cannot be
    trusted as a stored aggregate — this walks the route's own points in linked-list
    order instead, mirroring the frontend's client-side calc in
    `lib/itinerary/distance.ts` (one source of truth, computed on read everywhere).

    Points are walked *per day*, in `day_number` order, and the per-day walks are
    concatenated (so the day-crossing leg is included). A single global walk over
    all points is NOT deterministic: each day's chain is disconnected from the
    next, and `walk_linked_list` orders disconnected heads by UUIDv7 string —
    points created in the same millisecond tie on the timestamp prefix and sort
    by their random bits, letting a later day's head sort first and inflating
    the distance (observed 10.8 nm vs the true 7.2 nm on the e2e seed route,
    2026-07-10).
    """
    days_sorted = sorted(
        (day for day in days if getattr(day, "day_number", None) not in (None, 0)),
        key=lambda day: day.day_number,
    )

    ordered: list = []
    for day in days_sorted:
        day_points = day.points or []
        point_map = {str(p.id): p for p in day_points}
        ordered.extend(point_map[pid] for pid in walk_linked_list(day_points))

    placed = [p for p in ordered if p.latitude is not None and p.longitude is not None]

    total = 0.0
    for a, b in zip(placed, placed[1:]):
        total += haversine_nm(float(a.latitude), float(a.longitude), float(b.latitude), float(b.longitude))
    return total
