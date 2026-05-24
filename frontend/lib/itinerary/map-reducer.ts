import type { Point } from "@/lib/dtos/point"
import type { Day } from "@/lib/dtos/day"
import { walkList } from "./linked-list"

export type SlideState = {
  dayId: string
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
  | { type: "POINTS_ASSIGN"; dayId: string; pointIds: string[] }
  | { type: "SLIDE_START"; dayId: string; boundaryPointId: string | null; firstAssignableId: string | null }
  | { type: "SLIDE_HOVER"; hoveredPointId: string }
  | { type: "SLIDE_COMMIT" }
  | { type: "SLIDE_CANCEL" }

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

    case "POINTS_ASSIGN":
      return {
        ...state,
        points: state.points.map((p) =>
          p.id && action.pointIds.includes(p.id) ? { ...p, dayId: action.dayId } : p
        ),
      }

    case "SLIDE_START":
      return {
        ...state,
        slideState: {
          dayId: action.dayId,
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

    case "SLIDE_CANCEL":
      return { ...state, slideState: null }
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
