from typing import Any, Dict, Iterable, List, Tuple

from Services.Utils.geo_utils import haversine_nm
from Services.Utils.point_ordering import walk_linked_list


def _ordered_placed_points(days: Iterable) -> List[Tuple[int, Any]]:
    """The route's placed points in paddling order, each paired with its day_number.

    The ordering rules live here rather than in each caller: numbered days only (day 0 is
    the internal staging tail, M20 §1), sorted by `day_number`, walked per day and then
    concatenated. A single global walk is NOT deterministic — see `compute_total_miles`.
    """
    days_sorted = sorted(
        (day for day in days if getattr(day, "day_number", None) not in (None, 0)),
        key=lambda day: day.day_number,
    )

    ordered: List[Tuple[int, Any]] = []
    for day in days_sorted:
        day_points = day.points or []
        point_map = {str(p.id): p for p in day_points}
        for point_id in walk_linked_list(day_points):
            point = point_map[point_id]
            if point.latitude is not None and point.longitude is not None:
                ordered.append((day.day_number, point))
    return ordered


def compute_day_miles(days: Iterable) -> Dict[int, float]:
    """Nautical miles paddled on each numbered day, keyed by `day_number`.

    A leg is attributed to the day of the point it ARRIVES at, which is M20 §2's rule
    applied to the aggregate: the overnight stop belongs to the day that ends there, so
    the crossing into a day is that day's first leg. Walking each day's own points in
    isolation instead would drop one leg per day boundary and report nothing at all for
    a day whose only point is its arrival.

    Summing the result therefore equals `compute_total_miles` exactly.
    """
    ordered = _ordered_placed_points(days)
    per_day: Dict[int, float] = {day_number: 0.0 for day_number, _ in ordered}
    for (_, a), (arrival_day, b) in zip(ordered, ordered[1:]):
        per_day[arrival_day] += haversine_nm(
            float(a.latitude), float(a.longitude), float(b.latitude), float(b.longitude)
        )
    return per_day


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
    placed = [point for _, point in _ordered_placed_points(days)]

    total = 0.0
    for a, b in zip(placed, placed[1:]):
        total += haversine_nm(float(a.latitude), float(a.longitude), float(b.latitude), float(b.longitude))
    return total
