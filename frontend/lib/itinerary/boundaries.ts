import type { Day } from "@/lib/dtos/day"
import { POINT_TYPE, type PointType } from "@/lib/dtos/point"
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

const DRAFT_DAY_PREFIX = "draft-"

// A draft day only exists in local boundary-edit state — no Day row has been
// created for it server-side yet.
export function isDraftDay(dayId: string): boolean {
  return dayId.startsWith(DRAFT_DAY_PREFIX)
}

// Appends a new slice at the end of the draft list, splitting the last
// slice's point range at its midpoint. The new slice gets a synthetic,
// client-only dayId — no Day is created server-side until the draft is saved.
export function appendDraftSlice(slices: DaySlice[], pointOrderLength: number): DaySlice[] {
  const nextDayNumber = slices.length + 1
  const dayId = `${DRAFT_DAY_PREFIX}${nextDayNumber}`

  if (slices.length === 0) {
    return [
      {
        dayId,
        dayNumber: nextDayNumber,
        startIdx: 0,
        endIdx: Math.max(0, pointOrderLength - 1),
        date: null,
      },
    ]
  }

  const lastSlice = slices[slices.length - 1]
  const midIdx = Math.floor((lastSlice.startIdx + lastSlice.endIdx) / 2)
  return [
    ...slices.slice(0, -1),
    { ...lastSlice, endIdx: midIdx },
    { dayId, dayNumber: nextDayNumber, startIdx: midIdx, endIdx: lastSlice.endIdx, date: null },
  ]
}

// Removes a slice and merges its point range into the previous slice (or the
// next one, if it was first), renumbering the remaining slices sequentially.
// Only meant for draft-only days: nothing was ever created server-side, so
// there's nothing to roll back beyond this local state change.
export function removeDraftSlice(slices: DaySlice[], dayId: string): DaySlice[] {
  const i = slices.findIndex((s) => s.dayId === dayId)
  if (i === -1) return slices
  const removed = slices[i]

  return slices
    .filter((_, idx) => idx !== i)
    .map((s, idx) => {
      if (i > 0 && idx === i - 1) return { ...s, endIdx: removed.endIdx }
      if (i === 0 && idx === 0) return { ...s, startIdx: removed.startIdx }
      return s
    })
    .map((s, idx) => ({ ...s, dayNumber: idx + 1 }))
}

// Walks backward from `index` (inclusive) to find the nearest slice with a
// date set — used as a DatePicker's minDate so a day can never be dated
// before the closest earlier day that actually has a date (skipping over any
// undated days in between). Returns undefined when nothing earlier is dated
// (e.g. day 1, or every earlier day is also undated).
export function latestDatedSliceDate(slices: DaySlice[], index: number): string | undefined {
  for (let i = index; i >= 0; i--) {
    const date = slices[i]?.date
    if (date) return date
  }
  return undefined
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
      if (point && point.type === POINT_TYPE.STOP) {
        pointUpdates.push({ id, type: POINT_TYPE.POSITION })
        seenIds.add(id)
      }
    }
  }

  for (const id of newBoundaryIds) {
    if (!seenIds.has(id)) {
      const point = points.find((p) => p.id === id)
      if (point && point.type !== POINT_TYPE.STOP) {
        pointUpdates.push({ id, type: POINT_TYPE.STOP })
        seenIds.add(id)
      }
    }
  }

  return { boundaries, points: pointUpdates }
}
