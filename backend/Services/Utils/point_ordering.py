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
