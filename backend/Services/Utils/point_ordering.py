from typing import Dict, List, Optional, Set

from Models.point import Point


def walk_linked_list(points: List[Point]) -> List[str]:
    """Return point IDs in linked-list order, walking all disconnected chains.

    UUID v7 IDs sort lexicographically by creation time, so sorting heads by
    str(id) gives a stable, deterministic order for orphaned chains.
    """
    referenced: Set[str] = {str(p.next_id) for p in points if p.next_id}
    heads = [p for p in points if str(p.id) not in referenced]
    if not heads:
        return []
    heads.sort(key=lambda p: str(p.id))
    point_map: Dict[str, Point] = {str(p.id): p for p in points}
    order: List[str] = []
    visited: Set[str] = set()
    for head in heads:
        current: Optional[Point] = head
        while current and str(current.id) not in visited:
            visited.add(str(current.id))
            order.append(str(current.id))
            current = point_map.get(str(current.next_id)) if current.next_id else None
    return order


def chain_in_order(points: List[Point]) -> None:
    """Wire `next_id` so the linked list follows the given list order.

    The inverse of `walk_linked_list`: given points in the order a client sent
    them, make that order the route's own. Callers must have flushed the points
    already — the chain is written from their ids.

    Without this, points created from an ordered payload array are every one of
    them a disconnected head, and `walk_linked_list` falls back to sorting heads
    by `str(id)`. UUIDv7 makes that creation order *only* while the timestamp
    prefixes differ; points written in the same millisecond tie there and sort by
    their random bits instead, so the route's order — and every distance derived
    from it — comes out differently run to run.
    """
    for current, following in zip(points, points[1:]):
        current.next_id = following.id
    if points:
        points[-1].next_id = None
