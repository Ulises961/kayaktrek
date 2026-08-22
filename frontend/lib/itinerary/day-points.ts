export type DayGroup<T> = {
  /** The point the day is paddled *from* — the previous point in route order,
   * which for every day after the first is the overnight stop the previous day
   * owns. Null for the day that opens the route. */
  seed: T | null
  own: T[]
}

/**
 * Split a route (already in `pointOrder`) into per-day groups, each carrying the
 * point it is paddled from.
 *
 * Single-owner storage puts the shared overnight stop on the day that *ends*
 * there, so a day's own points start one point after it. Grouping by `dayId`
 * alone therefore loses the crossing leg entirely — the first point of every day
 * looks like a fresh start with nothing behind it. The seed is that missing
 * point, and it is deliberately "the previous point in route order" rather than
 * "the previous day's end point" so the Day 0 staging tail gets one too: the
 * route's growing tip is then measured from the last real stop, not from
 * whichever staged point happens to come first.
 *
 * A day whose points are not contiguous in the order (nothing produces that
 * today) seeds from the point before its first appearance.
 */
export function dayRouteGroups<T extends { dayId?: string | null }>(
  ordered: T[],
): Map<string | null, DayGroup<T>> {
  const groups = new Map<string | null, DayGroup<T>>()
  ordered.forEach((point, index) => {
    const key = point.dayId ?? null
    const group = groups.get(key)
    if (group) group.own.push(point)
    else groups.set(key, { seed: index > 0 ? ordered[index - 1] : null, own: [point] })
  })
  return groups
}

export type DayLike = {
  startPointId?: string | null
  endPointId?: string | null
}

export type ChainNode = {
  id?: string | null
  nextId?: string | null
}

// Walks a day's own points via a chain-head heuristic: start from whichever
// point nothing else in the set references as `nextId`. Only used as a
// fallback when a day has no boundary metadata yet (a fresh day that has
// never had boundaries applied).
function walkFromChainHead<T extends ChainNode>(points: T[]): T[] {
  if (points.length === 0) return []
  const map = new Map(points.filter((p) => p.id).map((p) => [p.id!, p]))
  const referenced = new Set(points.map((p) => p.nextId).filter((id): id is string => !!id))
  const head = points.find((p) => p.id && !referenced.has(p.id))
  if (!head) return []
  const ordered: T[] = []
  const visited = new Set<string>()
  let cur: T | undefined = head
  while (cur) {
    if (cur.id) {
      if (visited.has(cur.id)) break
      visited.add(cur.id)
    }
    ordered.push(cur)
    cur = cur.nextId ? map.get(cur.nextId) : undefined
  }
  return ordered
}

/**
 * Walks a day's actual route points by following `startPointId` → `nextId` →
 * `endPointId` through a *global* point lookup, rather than the day's own
 * `points` array. Single-owner storage means the point shared with the
 * adjacent day is not necessarily present in this day's own `points` — this
 * sidesteps that entirely, since it never asks which day owns a given row.
 *
 * Falls back to `fallbackPoints` (walked via a chain-head heuristic) only
 * when the day has no boundary metadata yet or it doesn't resolve — a
 * fresh/organic day that has never had boundaries applied.
 */
export function walkDayRoutePoints<T extends ChainNode>(
  day: DayLike,
  pointsById: Map<string, T>,
  fallbackPoints?: T[],
): T[] {
  if (day.startPointId) {
    const start = pointsById.get(day.startPointId)
    if (start) {
      const ordered: T[] = []
      const visited = new Set<string>()
      let cur: T | undefined = start
      while (cur) {
        if (cur.id) {
          if (visited.has(cur.id)) break
          visited.add(cur.id)
        }
        ordered.push(cur)
        if (cur.id === day.endPointId) break
        cur = cur.nextId ? pointsById.get(cur.nextId) : undefined
      }
      return ordered
    }
  }
  return walkFromChainHead(fallbackPoints ?? [])
}
