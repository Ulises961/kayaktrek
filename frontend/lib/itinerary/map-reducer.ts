import type { Point, PointType } from "@/lib/dtos/point"
import type { Day } from "@/lib/dtos/day"
import type { DraftBoundary } from "./boundaries"
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
  | { type: "POINTS_ASSIGN"; dayId: string; pointIds: string[]; day0Id: string; startPointId: string | null }
  | { type: "BOUNDARIES_APPLY"; boundaries: DraftBoundary[]; pointUpdates: { id: string; type: PointType; name?: string }[]; day0Id: string }
  | { type: "STATE_REPLACE"; state: MapState }

export function mapReducer(state: MapState, action: MapAction): MapState {
  switch (action.type) {
    case "POINT_ADD":
      return {
        ...state,
        points: [...state.points, action.point],
        pointOrder: action.point.id
          ? [...state.pointOrder, action.point.id]
          : state.pointOrder,
      }

    case "POINT_CONFIRM":
      return {
        ...state,
        points: state.points.map((p) => (p.id === action.tempId ? action.point : p)),
        pointOrder: state.pointOrder.map((id) =>
          id === action.tempId ? (action.point.id ?? id) : id
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
        points: state.points.map((p) =>
          p.id === action.id ? { ...p, ...action.fields } : p
        ),
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
          .map((d) => d.dayNumber > removedNum ? { ...d, dayNumber: d.dayNumber - 1 } : d),
        points: state.points.map((p) =>
          p.dayId === action.id ? { ...p, dayId: action.day0Id } : p
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
          if (p.dayId === action.dayId && p.id && !keepSet.has(p.id)) return { ...p, dayId: action.day0Id }
          return p
        }),
      }
    }

    case "BOUNDARIES_APPLY": {
      const { boundaries, pointUpdates, day0Id } = action
      const updateMap = new Map(pointUpdates.map((u) => [u.id, u]))

      // Ownership semantics: the boundary stop (at endPointIdx) belongs to the
      // day that ENDS there (day[i]), not the following day.  This keeps the
      // last leg of each day in the same day's colour on the map.
      //
      // Day at index i owns:
      //   i == 0: indices [0, endPointIdx[0]]          (boundary stop included)
      //   i  > 0: indices [endPointIdx[i-1]+1, endPointIdx[i]]  (skip shared stop)

      // Build the set of all boundary start and end point IDs for stop promotion.
      // The last boundary always extends to the final point so trailing points
      // are never left grey.
      const boundaryStopIds = new Set<string>()
      boundaries.forEach((b, i) => {
        const isLast = i === boundaries.length - 1
        const effectiveEndIdx = isLast ? state.pointOrder.length - 1 : b.endPointIdx
        const startIdx = i === 0 ? 0 : boundaries[i - 1].endPointIdx
        const startId = state.pointOrder[startIdx]
        const endId = state.pointOrder[effectiveEndIdx]
        if (startId) boundaryStopIds.add(startId)
        if (endId) boundaryStopIds.add(endId)
      })

      // Assign dayId to each point by walking boundaries in order.
      const pointDayMap = new Map<string, string>()
      boundaries.forEach((b, i) => {
        const isLast = i === boundaries.length - 1
        const effectiveEndIdx = isLast ? state.pointOrder.length - 1 : b.endPointIdx
        if (i === 0) {
          for (let idx = 0; idx <= effectiveEndIdx; idx++) {
            const id = state.pointOrder[idx]
            if (id) pointDayMap.set(id, b.dayId)
          }
        } else {
          const startIdx = boundaries[i - 1].endPointIdx + 1
          for (let idx = startIdx; idx <= effectiveEndIdx; idx++) {
            const id = state.pointOrder[idx]
            if (id) pointDayMap.set(id, b.dayId)
          }
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

      // Update day boundaries from the new draft.
      const newDays = state.days.map((d) => {
        const bEntry = boundaries.find((b) => b.dayId === d.id)
        if (!bEntry) return d
        const bIdx = boundaries.indexOf(bEntry)
        const isLast = bIdx === boundaries.length - 1
        const effectiveEndIdx = isLast ? state.pointOrder.length - 1 : bEntry.endPointIdx
        // startPointId: index 0 for first day, previous endPointIdx for later days
        const startIdx = bIdx === 0 ? 0 : boundaries[bIdx - 1].endPointIdx
        const startPointId = state.pointOrder[startIdx] ?? d.startPointId
        const endPointId = state.pointOrder[effectiveEndIdx] ?? d.endPointId
        return {
          ...d,
          startPointId,
          endPointId,
          ...(bEntry.date !== null ? { date: bEntry.date ?? undefined } : {}),
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
  const ordered = walked.length >= Math.ceil(withId.length / 2)
    ? walked
    : [...withId].sort((a, b) => (a.id ?? "").localeCompare(b.id ?? ""))
  const pointOrder = ordered.map((p) => p.id!)

  // Reassign dayId for points that fall within a numbered day's [startPointId, endPointId] range.
  // The DB stores all points under Day 0 (staging); numbered days record only boundary FKs.
  // The boundary stop (endPointId of day N = startPointId of day N+1) belongs to day N, so
  // days after the first skip the first point in their range (already assigned to the prev day).
  const reassigned = new Map<string, string>()
  const sortedDays = [...days].filter((d) => d.dayNumber > 0).sort((a, b) => a.dayNumber - b.dayNumber)
  for (let j = 0; j < sortedDays.length; j++) {
    const day = sortedDays[j]
    if (!day.id || !day.startPointId) continue
    const startIdx = pointOrder.indexOf(day.startPointId)
    const endIdx = day.endPointId ? pointOrder.indexOf(day.endPointId) : -1
    if (startIdx === -1) continue
    const isLastDay = j === sortedDays.length - 1
    const stop = isLastDay ? pointOrder.length - 1 : (endIdx >= startIdx ? endIdx : pointOrder.length - 1)
    const assignStart = j === 0 ? startIdx : startIdx + 1
    for (let i = assignStart; i <= stop; i++) reassigned.set(pointOrder[i], day.id)
  }

  const hydratedPoints = reassigned.size > 0
    ? points.map((p) => p.id && reassigned.has(p.id) ? { ...p, dayId: reassigned.get(p.id) } : p)
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
