import type { Day } from "@/lib/dtos/day"
import type { PointType } from "@/lib/dtos/point"
import type { MapState } from "./map-reducer"

export type DaySlice = {
  dayId: string
  dayNumber: number
  // Inclusive range of pointOrder indices owned by this day.
  // startIdx === 0 for day 1; startIdx === prev.endIdx for later days (shared boundary stop).
  // startIdx > endIdx means the day is empty (no points assigned).
  startIdx: number
  endIdx: number
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

export function initDaySlices(days: Day[], pointOrder: string[]): DaySlice[] {
  const sorted = days
    .filter((d) => d.dayNumber > 0 && d.id)
    .sort((a, b) => a.dayNumber - b.dayNumber)

  const N = sorted.length
  const M = pointOrder.length

  // Compute endIdx for each day. For days without a saved endPointId we spread
  // evenly to avoid index collisions between handles.
  // The last slice always extends to M-1 so tail-orphan points (dropped after
  // the last boundary, or left behind by a deleted middle day) are never stranded.
  const endIndices: number[] = sorted.map((day, i) => {
    const isLast = i === N - 1
    if (isLast) return Math.max(0, M - 1)
    if (day.endPointId) {
      const idx = pointOrder.indexOf(day.endPointId)
      if (idx !== -1) return idx
    }
    // No saved endpoint — spread evenly.
    return Math.min(M - 1, Math.max(i, Math.round(((i + 1) * M) / N) - 1))
  })

  return sorted.map((day, i) => ({
    dayId: day.id!,
    dayNumber: day.dayNumber,
    // startIdx: day 1 starts at 0; later days start at the previous day's endIdx
    // (shared overnight-stop semantics — the boundary point belongs to the ending day).
    startIdx: i === 0 ? 0 : endIndices[i - 1],
    endIdx: endIndices[i],
    date: day.date ?? null,
  }))
}

export function applySlicesToPreviewDays(
  slices: DaySlice[],
  days: Day[],
  pointOrder: string[],
): Day[] {
  const sliceById = new Map(slices.map((s) => [s.dayId, s]))

  return days.map((day) => {
    const slice = sliceById.get(day.id ?? "")
    if (!slice || day.dayNumber === 0) return day

    const isEmpty = slice.startIdx > slice.endIdx
    return {
      ...day,
      startPointId: isEmpty ? null : (pointOrder[slice.startIdx] ?? null),
      endPointId: isEmpty ? null : (pointOrder[slice.endIdx] ?? null),
      date: slice.date ?? day.date,
    }
  })
}

export function computeSlicesApplyPayload(
  slices: DaySlice[],
  state: MapState,
): BoundaryApplyPayload {
  const { pointOrder, days, points } = state

  const newBoundaryIds = new Set<string>()
  const boundaries: BoundaryPayloadItem[] = []
  for (const slice of slices) {
    const isEmpty = slice.startIdx > slice.endIdx
    if (isEmpty) continue
    const startPointId = pointOrder[slice.startIdx] ?? ""
    const endPointId = pointOrder[slice.endIdx] ?? ""
    if (!startPointId || !endPointId) continue
    newBoundaryIds.add(startPointId)
    newBoundaryIds.add(endPointId)
    boundaries.push({ dayId: slice.dayId, startPointId, endPointId, date: slice.date })
  }

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
