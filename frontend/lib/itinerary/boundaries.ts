import type { Day } from "@/lib/dtos/day"
import type { PointType } from "@/lib/dtos/point"
import type { MapState } from "./map-reducer"

export type DraftBoundary = {
  dayId: string
  dayNumber: number
  endPointIdx: number
  date: string | null
}

type BoundaryPayloadItem = {
  dayId: string
  startPointId: string
  endPointId: string
  date: string | null
}

type PointPayloadItem = {
  id: string
  type: PointType
  name?: string
}

export type BoundaryApplyPayload = {
  boundaries: BoundaryPayloadItem[]
  points: PointPayloadItem[]
}

export function initDraftBoundaries(days: Day[], pointOrder: string[]): DraftBoundary[] {
  const sorted = days
    .filter((d) => d.dayNumber > 0 && d.id)
    .sort((a, b) => a.dayNumber - b.dayNumber)

  const N = sorted.length
  const M = pointOrder.length

  return sorted.map((day, i) => ({
    dayId: day.id!,
    dayNumber: day.dayNumber,
    // The last day always extends to the final point so trailing points are
    // never left uncoloured.  Earlier days without an endPointId are spread
    // evenly to prevent Map key collisions from hiding their handles.
    endPointIdx: i === N - 1
      ? M - 1
      : day.endPointId
        ? pointOrder.indexOf(day.endPointId)
        : Math.min(M - 1, Math.max(i, Math.round(((i + 1) * M) / N) - 1)),
    date: day.date ?? null,
  }))
}

export function applyDraftToPreviewDays(
  draft: DraftBoundary[],
  days: Day[],
  pointOrder: string[]
): Day[] {
  const sorted = [...draft].sort((a, b) => a.dayNumber - b.dayNumber)
  const draftByDayId = new Map(sorted.map((b) => [b.dayId, b]))

  return days.map((day) => {
    const boundary = draftByDayId.get(day.id ?? "")
    if (!boundary || day.dayNumber === 0) return day

    const myIdx = sorted.findIndex((b) => b.dayId === day.id)
    const prevBoundary = myIdx > 0 ? sorted[myIdx - 1] : null
    const startPointId = prevBoundary
      ? (pointOrder[prevBoundary.endPointIdx] ?? null)
      : (pointOrder[0] ?? null)
    const endPointId = pointOrder[boundary.endPointIdx] ?? null

    return {
      ...day,
      startPointId,
      endPointId,
      date: boundary.date ?? day.date,
    }
  })
}

export function computeBoundaryApplyPayload(
  draft: DraftBoundary[],
  state: MapState
): BoundaryApplyPayload {
  const sorted = [...draft].sort((a, b) => a.dayNumber - b.dayNumber)
  const { pointOrder, days, points } = state

  const newBoundaryIds = new Set<string>()
  const boundaries: BoundaryPayloadItem[] = sorted.map((boundary, i) => {
    const prevBoundary = i > 0 ? sorted[i - 1] : null
    const startPointId = prevBoundary
      ? (pointOrder[prevBoundary.endPointIdx] ?? "")
      : (pointOrder[0] ?? "")
    const endPointId = pointOrder[boundary.endPointIdx] ?? ""

    if (startPointId) newBoundaryIds.add(startPointId)
    if (endPointId) newBoundaryIds.add(endPointId)

    return { dayId: boundary.dayId, startPointId, endPointId, date: boundary.date }
  })

  const oldBoundaryIds = new Set<string>()
  for (const day of days) {
    if (day.dayNumber === 0) continue
    if (day.startPointId) oldBoundaryIds.add(day.startPointId)
    if (day.endPointId) oldBoundaryIds.add(day.endPointId)
  }

  const seenIds = new Set<string>()
  const pointUpdates: PointPayloadItem[] = []

  for (const id of oldBoundaryIds) {
    if (!newBoundaryIds.has(id) && !seenIds.has(id)) {
      const point = points.find((p) => p.id === id)
      if (point && point.type === "stop") {
        pointUpdates.push({ id, type: "position" })
        seenIds.add(id)
      }
    }
  }

  for (const id of newBoundaryIds) {
    if (!seenIds.has(id)) {
      const point = points.find((p) => p.id === id)
      if (point && point.type !== "stop") {
        pointUpdates.push({ id, type: "stop" })
        seenIds.add(id)
      }
    }
  }

  return { boundaries, points: pointUpdates }
}
