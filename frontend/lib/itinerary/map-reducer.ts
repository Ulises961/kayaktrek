import type { Point } from "@/lib/dtos/point"
import type { Day } from "@/lib/dtos/day"
import { SlidePhase } from "@/lib/types/ui"
import { walkList } from "./linked-list"

export type SlideState = {
  dayId: string
  phase: SlidePhase
  // FK stored as Day.startPointId. null = waiting for Day 1 first click.
  // For Day 2+: pre-filled with the previous day's end (boundary point).
  boundaryPointId: string | null
  // First point included in the assign call. null = same as boundary point (Day 1 before click).
  firstAssignableId: string | null
  hoveredPointId: string | null
}

export type MapState = {
  points: Point[]
  // Canonical render order — maintained independently of the `next` linked list.
  // This is the source of truth for route order on the frontend; `next` links are
  // backend state that may lag during optimistic updates.
  pointOrder: string[]
  pendingPointId: string | null
  savingCount: number
  days: Day[]
  slideState: SlideState | null
}

export type MapAction =
  | { type: "POINT_ADD"; point: Point }
  | { type: "POINT_CONFIRM"; tempId: string; point: Point }
  | { type: "POINT_ROLLBACK"; id: string }
  | { type: "POINT_UPDATE"; id: string; fields: Partial<Point> }
  | { type: "POINT_REMOVE"; id: string }
  | { type: "SET_PENDING"; id: string | null }
  | { type: "SAVING_START" }
  | { type: "SAVING_END" }
  | { type: "DAY_ADD"; day: Day }
  | { type: "DAY_UPDATE"; id: string; fields: Partial<Day> }
  | { type: "DAY_REMOVE"; id: string; day0Id: string }
  | { type: "POINTS_ASSIGN"; dayId: string; pointIds: string[]; day0Id: string; startPointId: string | null }
  | { type: "SLIDE_START"; dayId: string; phase: SlidePhase; boundaryPointId: string | null; firstAssignableId: string | null }
  | { type: "SLIDE_HOVER"; hoveredPointId: string }
  | { type: "SLIDE_COMMIT" }
  | { type: "SLIDE_CANCEL"; restore?: { dayId: string; startPointId: string; endPointId: string | null; day0Id: string } }

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
        slideState: state.slideState?.dayId === action.id ? null : state.slideState,
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

    case "SLIDE_START":
      return {
        ...state,
        slideState: {
          dayId: action.dayId,
          phase: action.phase,
          boundaryPointId: action.boundaryPointId,
          firstAssignableId: action.firstAssignableId,
          hoveredPointId: null,
        },
      }

    case "SLIDE_HOVER":
      if (!state.slideState) return state
      return {
        ...state,
        slideState: { ...state.slideState, hoveredPointId: action.hoveredPointId },
      }

    case "SLIDE_COMMIT":
      return { ...state, slideState: null }

    case "SLIDE_CANCEL": {
      if (!action.restore) return { ...state, slideState: null }
      const { dayId, startPointId, endPointId, day0Id } = action.restore
      const startIdx = state.pointOrder.indexOf(startPointId)
      const endIdx = endPointId ? state.pointOrder.indexOf(endPointId) : -1
      const keepIds = new Set(
        endIdx >= startIdx && endIdx >= 0
          ? state.pointOrder.slice(startIdx, endIdx + 1)
          : [startPointId]
      )
      return {
        ...state,
        points: state.points.map((p) => {
          if (!p.id) return p
          if (keepIds.has(p.id)) return { ...p, dayId }
          if (p.dayId === dayId) return { ...p, dayId: day0Id }
          return p
        }),
        slideState: null,
      }
    }
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
  const reassigned = new Map<string, string>()
  const sortedDays = [...days].filter((d) => d.dayNumber > 0).sort((a, b) => a.dayNumber - b.dayNumber)
  for (const day of sortedDays) {
    if (!day.id || !day.startPointId) continue
    const startIdx = pointOrder.indexOf(day.startPointId)
    const endIdx = day.endPointId ? pointOrder.indexOf(day.endPointId) : -1
    if (startIdx === -1) continue
    const stop = endIdx >= startIdx ? endIdx : pointOrder.length - 1
    for (let i = startIdx; i <= stop; i++) reassigned.set(pointOrder[i], day.id)
  }

  const hydratedPoints = reassigned.size > 0
    ? points.map((p) => p.id && reassigned.has(p.id) ? { ...p, dayId: reassigned.get(p.id) } : p)
    : points

  return {
    points: hydratedPoints,
    pointOrder,
    pendingPointId: null,
    savingCount: 0,
    days,
    slideState: null,
  }
}
