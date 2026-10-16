from typing import Dict, List, Optional, Set

from Models.itinerary import Itinerary
from Models.point import Point


def bump_route_version(itinerary: Itinerary) -> None:
    """Bump the route's optimistic-concurrency token.

    Call this on every structural route change — point add/delete/reorder, day
    boundary move — so mobile sync-down can detect a diverged route as a single
    version mismatch rather than diffing every point. See
    docs/mobile/sync-protocol-spec.md §8.1. Caller is responsible for the
    session commit, same as chain_in_order below.
    """
    itinerary.route_version += 1


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


def assign_order_keys(points_in_order: List[Point]) -> None:
    """Write a fresh, widely-spaced `order_key` to each point in `points_in_order`.

    Called on every mobile pull after walking the current `next_id`
    chain with `walk_linked_list` — the device never sees `next_id`, only this
    column (docs/mobile/sync-protocol-spec.md §7.2). Regenerated wholesale each
    time, so the keys need no fractional-insert support themselves; the wide
    fixed step (1000) is headroom for the device's OWN local inserts between two
    synced points before its next pull refreshes the keyspace.

    Zero-padded to a fixed width so lexicographic string order matches the
    intended numeric order — plain digit strings ("999" > "1000") do not.
    """
    width = max(8, len(str((len(points_in_order) + 1) * 1000)))
    for index, point in enumerate(points_in_order):
        point.order_key = str((index + 1) * 1000).zfill(width)


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


def chain_from_order_keys(points: List[Point]) -> None:
    """Rebuild the `next_id` chain from each point's `order_key`.

    The inverse of `assign_order_keys`, applied on push — the
    device sends order keys, never `next_id`, and the server is the only party
    that converts back to the linked-list storage representation, atomically,
    in one transaction (§7.2). Ties (two points landing on the same key under
    concurrent device edits) break deterministically by id, same as
    `walk_linked_list`'s head-ordering fallback — a cosmetic tie, not a
    dangling pointer.
    """
    ordered = sorted(points, key=lambda point: (point.order_key or "", str(point.id)))
    chain_in_order(ordered)
