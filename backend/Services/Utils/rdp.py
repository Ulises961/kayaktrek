"""Ramer-Douglas-Peucker polyline simplification."""
import math
from typing import List, Tuple


def _perp_distance(
    point: Tuple[float, float],
    line_start: Tuple[float, float],
    line_end: Tuple[float, float],
) -> float:
    lat, lon = point
    lat1, lon1 = line_start
    lat2, lon2 = line_end
    if lat1 == lat2 and lon1 == lon2:
        return math.hypot(lat - lat1, lon - lon1)
    line_len_sq = (lat2 - lat1) ** 2 + (lon2 - lon1) ** 2
    t = max(0.0, min(1.0, ((lat - lat1) * (lat2 - lat1) + (lon - lon1) * (lon2 - lon1)) / line_len_sq))
    return math.hypot(lat - (lat1 + t * (lat2 - lat1)), lon - (lon1 + t * (lon2 - lon1)))


def rdp_simplify(points: List[Tuple[float, float]], epsilon: float) -> List[Tuple[float, float]]:
    """Return a simplified (lat, lon) sequence using the RDP algorithm at the given epsilon (degrees)."""
    if len(points) < 3:
        return list(points)
    dmax, index = 0.0, 0
    end = len(points) - 1
    for i in range(1, end):
        d = _perp_distance(points[i], points[0], points[end])
        if d > dmax:
            dmax, index = d, i
    if dmax > epsilon:
        left = rdp_simplify(points[: index + 1], epsilon)
        right = rdp_simplify(points[index:], epsilon)
        return left[:-1] + right
    return [points[0], points[end]]
