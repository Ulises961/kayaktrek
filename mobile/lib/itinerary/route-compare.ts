import { type EditableRoute, orderedPoints } from "./route-edits"

// M9d WP4: what differs between the phone's route and the version that changed
// elsewhere, for the leader to see before choosing (sync-protocol-spec.md §8.3).
// Point by point, by id: a point is the same point in both versions when it has
// the same id, whatever else about it changed.

export type RouteDifference = {
  kind: "only-mine" | "only-theirs" | "moved" | "day-changed" | "details-changed"
  pointId: string
  name: string | null
}

export type RouteComparison = {
  differences: RouteDifference[]
  // The points both versions share, in a different sequence.
  orderDiffers: boolean
}

// About ten metres: below that, a "move" is rounding, not an edit.
const MOVED_DEGREES = 0.0001

export function compareRoutes(mine: EditableRoute, theirs: EditableRoute): RouteComparison {
  const theirsById = new Map(theirs.points.map((point) => [point.id, point]))
  const mineById = new Map(mine.points.map((point) => [point.id, point]))
  const dayNumber = (route: EditableRoute, dayId: string) =>
    route.days.find((day) => day.id === dayId)?.dayNumber

  const differences: RouteDifference[] = []
  for (const point of orderedPoints(mine.points)) {
    const other = theirsById.get(point.id)
    if (!other) {
      differences.push({ kind: "only-mine", pointId: point.id, name: point.name })
      continue
    }
    if (
      Math.abs((point.latitude ?? 0) - (other.latitude ?? 0)) > MOVED_DEGREES ||
      Math.abs((point.longitude ?? 0) - (other.longitude ?? 0)) > MOVED_DEGREES
    ) {
      differences.push({ kind: "moved", pointId: point.id, name: point.name })
    }
    if (dayNumber(mine, point.dayId) !== dayNumber(theirs, other.dayId)) {
      differences.push({ kind: "day-changed", pointId: point.id, name: point.name })
    }
    if (point.name !== other.name || point.notes !== other.notes || point.type !== other.type) {
      differences.push({ kind: "details-changed", pointId: point.id, name: point.name })
    }
  }
  for (const point of orderedPoints(theirs.points)) {
    if (!mineById.has(point.id)) {
      differences.push({ kind: "only-theirs", pointId: point.id, name: point.name })
    }
  }

  const shared = (route: EditableRoute) =>
    orderedPoints(route.points)
      .map((point) => point.id)
      .filter((id) => mineById.has(id) && theirsById.has(id))
  const mineOrder = shared(mine)
  const theirsOrder = shared(theirs)
  const orderDiffers = mineOrder.some((id, index) => theirsOrder[index] !== id)

  return { differences, orderDiffers }
}
