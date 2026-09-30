// M9d WP3: editing the route on the phone, offline-first. Pure functions over the
// local route (the synced days/points tables, lib/db/route-edit.ts reads and writes
// them), so every rule here is testable without a database.
//
// The route is one ordered list of points across the whole trip — its order keys,
// the column the device holds instead of next_id (sync-protocol-spec.md §7.2) —
// with each point belonging to a day. A day's boundaries are derived from that,
// never edited directly, via `deriveDayBoundaries` (M34: shared with web's
// `@shared/itinerary/day-boundaries`, the one source of truth for what a day
// boundary is). That is the shape the web builder produces, so an edited route
// pushed from the phone reads the same on the web.

import { deriveDayBoundaries } from "@shared/itinerary/day-boundaries"

export type EditableDay = {
  id: string
  dayNumber: number
  date: string | null
  startPointId: string | null
  endPointId: string | null
}

export type EditablePoint = {
  id: string
  dayId: string
  orderKey: string | null
  latitude: number | null
  longitude: number | null
  name: string | null
  notes: string | null
  type: string | null
}

export type EditableRoute = { days: EditableDay[]; points: EditablePoint[] }

export type NewPoint = Omit<EditablePoint, "dayId" | "orderKey">

export type PointFields = Partial<Pick<EditablePoint, "name" | "notes" | "type" | "latitude" | "longitude">>

// The server's own spacing (backend Services/Utils/point_ordering.py
// assign_order_keys): zero-padded so string order is numeric order.
const ORDER_KEY_STEP = 1000
const ORDER_KEY_MIN_WIDTH = 8

export function orderedPoints(points: EditablePoint[]): EditablePoint[] {
  return [...points].sort((a, b) => {
    const byKey = (a.orderKey ?? "").localeCompare(b.orderKey ?? "")
    return byKey !== 0 ? byKey : a.id.localeCompare(b.id)
  })
}

function rekey(inOrder: EditablePoint[]): EditablePoint[] {
  const width = Math.max(ORDER_KEY_MIN_WIDTH, String((inOrder.length + 1) * ORDER_KEY_STEP).length)
  return inOrder.map((point, index) => ({
    ...point,
    orderKey: String((index + 1) * ORDER_KEY_STEP).padStart(width, "0"),
  }))
}

function withBoundaries(days: EditableDay[], inOrder: EditablePoint[]): EditableDay[] {
  const boundaries = deriveDayBoundaries(days, inOrder)
  return days.map((day) =>
    day.dayNumber > 0
      ? { ...day, ...boundaries[day.id] }
      : { ...day, startPointId: null, endPointId: null },
  )
}

// Every structural edit ends here: new order keys, and boundaries derived again.
function settle(route: EditableRoute, inOrder: EditablePoint[]): EditableRoute {
  const points = rekey(inOrder)
  return { days: withBoundaries(route.days, points), points }
}

export function editPoint(route: EditableRoute, pointId: string, fields: PointFields): EditableRoute {
  return {
    ...route,
    points: route.points.map((point) => (point.id === pointId ? { ...point, ...fields } : point)),
  }
}

export function deletePoint(route: EditableRoute, pointId: string): EditableRoute {
  return settle(
    route,
    orderedPoints(route.points).filter((point) => point.id !== pointId),
  )
}

/**
 * Add a point to a day, straight after `afterPointId` (one of that day's own
 * points), or first in the day when there is nothing to put it after.
 */
export function insertPoint(
  route: EditableRoute,
  dayId: string,
  afterPointId: string | null,
  newPoint: NewPoint,
): EditableRoute {
  const inOrder = orderedPoints(route.points)
  const added: EditablePoint = { ...newPoint, dayId, orderKey: null }

  let index: number
  if (afterPointId !== null) {
    index = inOrder.findIndex((point) => point.id === afterPointId) + 1
  } else {
    const firstOfDay = inOrder.findIndex((point) => point.dayId === dayId)
    index = firstOfDay >= 0 ? firstOfDay : positionAfterEarlierDays(route, inOrder, dayId)
  }
  inOrder.splice(index, 0, added)
  return settle(route, inOrder)
}

// Where an empty day's first point goes: after every point of the days before it.
function positionAfterEarlierDays(route: EditableRoute, inOrder: EditablePoint[], dayId: string): number {
  const dayNumbers = new Map(route.days.map((day) => [day.id, day.dayNumber]))
  const target = dayNumbers.get(dayId) ?? 0
  let index = 0
  inOrder.forEach((point, position) => {
    const number = dayNumbers.get(point.dayId) ?? 0
    if (number > 0 && number < target) index = position + 1
  })
  return index
}

/**
 * The day a point inserted after `afterPointId` (or, when null, before the
 * route's first point) belongs to — ported from web's M20 mid-route insertion
 * (`handleLegClick`): the successor's day first, falling back to the
 * predecessor's, falling back to Day 0. Mid-day the two already agree; this
 * only matters right at a day boundary, where the boundary stop belongs to
 * the day it *closes*, so a point inserted right after it belongs to the day
 * it *opens*.
 */
export function insertionDayId(route: EditableRoute, afterPointId: string | null): string {
  const inOrder = orderedPoints(route.points)
  const index = afterPointId ? inOrder.findIndex((point) => point.id === afterPointId) : -1
  const predecessor = index >= 0 ? inOrder[index] : null
  const successor = afterPointId ? inOrder[index + 1] : inOrder[0]
  const day0 = route.days.find((day) => day.dayNumber === 0)
  return successor?.dayId ?? predecessor?.dayId ?? day0?.id ?? ""
}

/** Move a point to another day, after that day's own last point. */
export function movePointToDay(route: EditableRoute, pointId: string, dayId: string): EditableRoute {
  const moving = route.points.find((point) => point.id === pointId)
  if (!moving || moving.dayId === dayId) return route
  const rest = orderedPoints(route.points).filter((point) => point.id !== pointId)
  const lastOfDay = rest.map((point) => point.dayId).lastIndexOf(dayId)
  const index = lastOfDay >= 0 ? lastOfDay + 1 : positionAfterEarlierDays(route, rest, dayId)
  rest.splice(index, 0, { ...moving, dayId })
  return settle(route, rest)
}

/**
 * The day's own point nearest a position — where a point added there most likely
 * belongs in the route. Flat-earth distance is plenty at the scale of one day.
 */
export function nearestPointInDay(
  route: EditableRoute,
  dayId: string,
  latitude: number,
  longitude: number,
): string | null {
  const cosLatitude = Math.cos((latitude * Math.PI) / 180)
  let nearest: string | null = null
  let nearestDistance = Number.POSITIVE_INFINITY
  for (const point of route.points) {
    if (point.dayId !== dayId || point.latitude === null || point.longitude === null) continue
    const dx = (point.longitude - longitude) * cosLatitude
    const dy = point.latitude - latitude
    const distance = dx * dx + dy * dy
    if (distance < nearestDistance) {
      nearestDistance = distance
      nearest = point.id
    }
  }
  return nearest
}

/**
 * Drag a point to a new position within its own day (M34 WP1/WP3, merged —
 * moving a point to a *different* day is out of scope here, left for the
 * future day-boundaries work). Repositions it only — it does NOT reorder it.
 *
 * An earlier version reordered by re-inserting the point next to whichever
 * remaining point was nearest the drop location (`nearestPointInDay`). That
 * heuristic is order-blind: on any route with real back-and-forth shape, the
 * nearest point by straight-line distance isn't necessarily the point's
 * neighbour along the path, so a drag could re-insert it in the wrong place
 * in the sequence and garble the drawn line into a non-linear path — found
 * on-device. Route order (`orderKey`) is otherwise only ever re-derived by an
 * actual insertion (`insertPoint`, and `deletePoint`/`movePointToDay`/
 * `movePointWithinDay`, which are a delete+insert or a swap) — a drag isn't
 * one, so it shouldn't touch order either. The legs drawn from a day's own
 * points already follow that stored order (day-route.ts's `walkPoints`), so
 * leaving it alone here is what keeps them linear through a drag.
 */
export function movePointByDrag(
  route: EditableRoute,
  pointId: string,
  latitude: number,
  longitude: number,
): EditableRoute {
  return editPoint(route, pointId, { latitude, longitude })
}

/** Swap a point with its neighbour in the same day: -1 earlier, 1 later. */
export function movePointWithinDay(route: EditableRoute, pointId: string, direction: -1 | 1): EditableRoute {
  const inOrder = orderedPoints(route.points)
  const index = inOrder.findIndex((point) => point.id === pointId)
  if (index < 0) return route
  const dayId = inOrder[index].dayId
  let neighbour = index + direction
  while (neighbour >= 0 && neighbour < inOrder.length && inOrder[neighbour].dayId !== dayId) {
    neighbour += direction
  }
  if (neighbour < 0 || neighbour >= inOrder.length) return route
  ;[inOrder[index], inOrder[neighbour]] = [inOrder[neighbour], inOrder[index]]
  return settle(route, inOrder)
}
