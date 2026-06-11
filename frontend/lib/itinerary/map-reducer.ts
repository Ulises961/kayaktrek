import type { Point, PointType } from "@/lib/dtos/point"
import type { Day } from "@/lib/dtos/day"
import type { DaySlice } from "./boundaries"
import { walkList } from "./linked-list"

export type MapState = {
  points: Point[]
  // Canonical render order — maintained independently of the `next` linked list.
  // This is the source of truth for route order on the frontend; `next` links are
  // backend state that may lag during optimistic updates.
  pointOrder: string[]
  pendingPointId: string | null
  // Name typed for the pending (newly dropped) point before it is persisted.
  pendingPointName: string | null
  savingCount: number
  days: Day[]
}

export type MapAction =
  | { type: "POINT_ADD"; point: Point }
  | { type: "POINT_CONFIRM"; tempId: string; point: Point }
  | { type: "POINT_ROLLBACK"; id: string }
  | { type: "POINT_UPDATE"; id: string; fields: Partial<Point> }
  | { type: "POINT_REMOVE"; id: string }
  | { type: "SET_PENDING"; id: string | null }
  | { type: "SET_PENDING_NAME"; name: string | null }
  | { type: "SAVING_START" }
  | { type: "SAVING_END" }
  | { type: "DAY_ADD"; day: Day }
  | { type: "DAY_UPDATE"; id: string; fields: Partial<Day> }
  | { type: "DAY_REMOVE"; id: string; day0Id: string }
  | {
      type: "POINTS_ASSIGN"
      dayId: string
      pointIds: string[]
      day0Id: string
      startPointId: string | null
    }
  | {
      type: "BOUNDARIES_APPLY"
      slices: DaySlice[]
      pointUpdates: { id: string; type: PointType; name?: string }[]
      day0Id: string
    }
  | { type: "STATE_REPLACE"; state: MapState }

export function mapReducer(state: MapState, action: MapAction): MapState {
  switch (action.type) {
    case "POINT_ADD":
      return {
        ...state,
        points: [...state.points, action.point],
        pointOrder: action.point.id ? [...state.pointOrder, action.point.id] : state.pointOrder,
      }

    case "POINT_CONFIRM":
      return {
        ...state,
        points: state.points.map((p) => (p.id === action.tempId ? action.point : p)),
        pointOrder: state.pointOrder.map((id) =>
          id === action.tempId ? (action.point.id ?? id) : id,
        ),
        pendingPointId: action.point.id ?? null,
        pendingPointName: null,
      }

    case "POINT_ROLLBACK":
      return {
        ...state,
        points: state.points.filter((p) => p.id !== action.id),
        pointOrder: state.pointOrder.filter((id) => id !== action.id),
        pendingPointId: null,
      }

    case "POINT_UPDATE":
      return {
        ...state,
        points: state.points.map((p) => (p.id === action.id ? { ...p, ...action.fields } : p)),
      }

    case "POINT_REMOVE":
      return {
        ...state,
        points: state.points.filter((p) => p.id !== action.id),
        pointOrder: state.pointOrder.filter((id) => id !== action.id),
        pendingPointId: state.pendingPointId === action.id ? null : state.pendingPointId,
      }

    case "SET_PENDING":
      return { ...state, pendingPointId: action.id }

    case "SET_PENDING_NAME":
      return { ...state, pendingPointName: action.name }

    case "SAVING_START":
      return { ...state, savingCount: state.savingCount + 1 }

    case "SAVING_END":
      return { ...state, savingCount: Math.max(0, state.savingCount - 1) }

    case "DAY_ADD":
      return { ...state, days: [...state.days, action.day] }

    case "DAY_UPDATE":
      return {
        ...state,
        days: state.days.map((d) => (d.id === action.id ? { ...d, ...action.fields } : d)),
      }

    case "DAY_REMOVE": {
      const removed = state.days.find((d) => d.id === action.id)
      if (!removed) return state
      const removedNum = removed.dayNumber
      return {
        ...state,
        days: state.days
          .filter((d) => d.id !== action.id)
          .map((d) => (d.dayNumber > removedNum ? { ...d, dayNumber: d.dayNumber - 1 } : d)),
        points: state.points.map((p) =>
          p.dayId === action.id ? { ...p, dayId: action.day0Id } : p,
        ),
      }
    }

    case "POINTS_ASSIGN": {
      const assignSet = new Set(action.pointIds)
      const keepSet = new Set(action.pointIds)
      if (action.startPointId) keepSet.add(action.startPointId)
      return {
        ...state,
        points: state.points.map((p) => {
          if (p.id && assignSet.has(p.id)) return { ...p, dayId: action.dayId }
          if (p.dayId === action.dayId && p.id && !keepSet.has(p.id))
            return { ...p, dayId: action.day0Id }
          return p
        }),
      }
    }

    case "BOUNDARIES_APPLY": {
      const { slices, pointUpdates, day0Id } = action
      const updateMap = new Map(pointUpdates.map((u) => [u.id, u]))

      // Ownership: the boundary stop at slice.endIdx belongs to the day that ends
      // there.  Day i+1 shares startIdx with Day i's endIdx, so we skip startIdx
      // when assigning (except for the first day which starts at 0).
      const boundaryStopIds = new Set<string>()
      for (const slice of slices) {
        if (slice.startIdx <= slice.endIdx) {
          const startId = state.pointOrder[slice.startIdx]
          const endId = state.pointOrder[slice.endIdx]
          if (startId) boundaryStopIds.add(startId)
          if (endId) boundaryStopIds.add(endId)
        }
      }

      const pointDayMap = new Map<string, string>()
      slices.forEach((slice, i) => {
        const ownedStart = i === 0 ? slice.startIdx : slice.startIdx + 1
        for (let idx = ownedStart; idx <= slice.endIdx; idx++) {
          const id = state.pointOrder[idx]
          if (id) pointDayMap.set(id, slice.dayId)
        }
      })

      const newPoints = state.points.map((p) => {
        if (!p.id) return p
        const update = updateMap.get(p.id)
        const newDayId = pointDayMap.get(p.id) ?? day0Id
        let newType: PointType = p.type ?? "position"

        if (update) {
          newType = update.type
        } else if (boundaryStopIds.has(p.id)) {
          newType = "stop"
        }

        return {
          ...p,
          dayId: newDayId,
          type: newType,
          ...(update?.name !== undefined ? { name: update.name } : {}),
        }
      })

      const newDays = state.days.map((d) => {
        const slice = slices.find((s) => s.dayId === d.id)
        if (!slice) return d
        const isEmpty = slice.startIdx > slice.endIdx
        return {
          ...d,
          startPointId: isEmpty ? null : (state.pointOrder[slice.startIdx] ?? d.startPointId),
          endPointId: isEmpty ? null : (state.pointOrder[slice.endIdx] ?? d.endPointId),
          ...(slice.date !== null ? { date: slice.date ?? undefined } : {}),
        }
      })

      return { ...state, points: newPoints, days: newDays }
    }

    case "STATE_REPLACE":
      return action.state
  }
}

export function initialMapState(points: Point[], days: Day[] = []): MapState {
  const withId = points.filter((p) => p.id)
  const walked = walkList(withId)
  // If walkList recovered fewer than half the points the linked list is absent/broken
  // (all next_id null). Fall back to UUID v7 lexicographic sort which preserves
  // insertion order because UUID v7 encodes a millisecond timestamp in the high bits.
  const ordered =
    walked.length >= Math.ceil(withId.length / 2)
      ? walked
      : [...withId].sort((a, b) => (a.id ?? "").localeCompare(b.id ?? ""))
  const pointOrder = ordered.map((p) => p.id!)

  // Reassign dayId for points that fall within a numbered day's [startPointId, endPointId] range.
  // The boundary stop (endPointId of day N = startPointId of day N+1) belongs to day N, so
  // days after the first skip startIdx (already assigned to the previous day).
  // Points beyond any day's endPointId remain in Day 0 (unassigned) until the next apply.
  const reassigned = new Map<string, string>()
  const sortedDays = [...days]
    .filter((d) => d.dayNumber > 0)
    .sort((a, b) => a.dayNumber - b.dayNumber)
  for (let j = 0; j < sortedDays.length; j++) {
    const day = sortedDays[j]
    if (!day.id || !day.startPointId || !day.endPointId) continue
    const startIdx = pointOrder.indexOf(day.startPointId)
    const endIdx = pointOrder.indexOf(day.endPointId)
    if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) continue
    const assignStart = j === 0 ? startIdx : startIdx + 1
    for (let i = assignStart; i <= endIdx; i++) reassigned.set(pointOrder[i], day.id)
  }

  const hydratedPoints =
    reassigned.size > 0
      ? points.map((p) =>
          p.id && reassigned.has(p.id) ? { ...p, dayId: reassigned.get(p.id) } : p,
        )
      : points

  return {
    points: hydratedPoints,
    pointOrder,
    pendingPointId: null,
    pendingPointName: null,
    savingCount: 0,
    days,
  }
}
