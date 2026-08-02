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

// M14: ID-anchored boundary draft. Unlike DaySlice (index-based, frozen at draft
// start), a DraftBoundary survives point mutations mid-draft — indices are only
// ever resolved at render time via resolveDraft, never stored.
//
// Invariants:
//   - The array is ordered by dayNumber; index 0 is Day 1.
//   - A day's *start* is never stored — it is always the previous day's
//     endPointId (shared overnight-stop semantics). Day 1 starts at pointOrder[0].
//   - The *last* day always extends to the tail of pointOrder at resolution time,
//     so its stored endPointId is ignored while it remains last — but it is still
//     carried, because it becomes load-bearing the moment another day is
//     appended after it (see appendDraftBoundary).
export type DraftBoundary = {
  dayId: string
  dayNumber: number
  endPointId: string | null
  date: string | null
}

// Pure. Recomputes DaySlice indices from a DraftBoundary[] against the current
// pointOrder — safe to call on every render, including mid-draft after point
// mutations shift indices around.
export function resolveDraft(draft: DraftBoundary[], pointOrder: string[]): DaySlice[] {
  const M = pointOrder.length

  // No points at all: every slice is explicitly empty. startIdx > endIdx is the
  // existing empty-day convention consumers already understand.
  if (M === 0) {
    return draft.map((boundary) => ({
      dayId: boundary.dayId,
      dayNumber: boundary.dayNumber,
      startIdx: 0,
      endIdx: -1,
      date: boundary.date,
    }))
  }

  const slices: DaySlice[] = []
  for (let i = 0; i < draft.length; i++) {
    const boundary = draft[i]
    const startIdx = i === 0 ? 0 : slices[i - 1].endIdx
    const isLast = i === draft.length - 1

    let endIdx: number
    if (isLast) {
      // Tail rule: the last day always extends to the end of pointOrder,
      // unconditionally — its stored endPointId is ignored here.
      endIdx = M - 1
    } else if (boundary.endPointId === null) {
      // Anchor loss (never set): clamp to the predecessor, a zero-length day.
      endIdx = startIdx
    } else {
      const idx = pointOrder.indexOf(boundary.endPointId)
      // Anchor loss (stale id, point deleted without patching the draft):
      // same clamp.
      endIdx = idx === -1 ? startIdx : idx
    }

    // Monotonicity: never overlap backwards or run off the end.
    endIdx = Math.min(M - 1, Math.max(endIdx, startIdx))

    slices.push({
      dayId: boundary.dayId,
      dayNumber: boundary.dayNumber,
      startIdx,
      endIdx,
      date: boundary.date,
    })
  }
  return slices
}

// The materializer — converts real Day rows into a draft, seeded by delegating
// to initDaySlices (reusing its even-spread fallback for days with no saved
// endPointId). Round-trip invariant: resolveDraft(initDraftBoundaries(days,
// pointOrder), pointOrder) deep-equals initDaySlices(days, pointOrder) for any
// pointOrder.length > 0 (see the boundaries test file).
export function initDraftBoundaries(days: Day[], pointOrder: string[]): DraftBoundary[] {
  const slices = initDaySlices(days, pointOrder)
  return slices.map((slice) => ({
    dayId: slice.dayId,
    dayNumber: slice.dayNumber,
    endPointId: pointOrder[slice.endIdx] ?? null,
    date: slice.date,
  }))
}

// Appends a new day using "collapse and drag" semantics (M14 — deliberately
// replaces appendDraftSlice's midpoint-split behavior, do not copy it): the new
// day takes over all of the old last day's points, and the old last day
// collapses to zero length, anchored at its own start (the overnight stop it
// shares with its predecessor).
export function appendDraftBoundary(draft: DraftBoundary[], pointOrder: string[]): DraftBoundary[] {
  const usedIds = new Set(draft.map((d) => d.dayId))
  let n = 1
  while (usedIds.has(`${DRAFT_DAY_PREFIX}${n}`)) n++
  const dayId = `${DRAFT_DAY_PREFIX}${n}`

  if (draft.length === 0) {
    return [{ dayId, dayNumber: 1, endPointId: null, date: null }]
  }

  const resolved = resolveDraft(draft, pointOrder)
  const lastSlice = resolved[resolved.length - 1]
  const oldLastDayStartAnchor = pointOrder[lastSlice.startIdx] ?? null

  const collapsedDraft = draft.map((boundary, idx) =>
    idx === draft.length - 1 ? { ...boundary, endPointId: oldLastDayStartAnchor } : boundary,
  )

  return [...collapsedDraft, { dayId, dayNumber: draft.length + 1, endPointId: null, date: null }]
}

// Removes a day and merges its point range into the previous day (or just
// drops it, if it was first — the new first day implicitly starts at
// pointOrder[0]), renumbering the remaining days sequentially.
export function removeDraftBoundary(draft: DraftBoundary[], dayId: string): DraftBoundary[] {
  const i = draft.findIndex((d) => d.dayId === dayId)
  if (i === -1) return draft
  const removed = draft[i]

  return draft
    .filter((_, idx) => idx !== i)
    .map((boundary, idx) => {
      if (i > 0 && idx === i - 1) return { ...boundary, endPointId: removed.endPointId }
      return boundary
    })
    .map((boundary, idx) => ({ ...boundary, dayNumber: idx + 1 }))
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
