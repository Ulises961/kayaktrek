import type { Point } from "@/lib/dtos/point"
import { walkList } from "./linked-list"

export type MapState = {
  points: Point[]
  // Canonical render order — maintained independently of the `next` linked list.
  // This is the source of truth for route order on the frontend; `next` links are
  // backend state that may lag during optimistic updates.
  pointOrder: string[]
  pendingPointId: string | null
  savingCount: number
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
  }
}

export function initialMapState(points: Point[]): MapState {
  const ordered = walkList(points.filter((p) => p.id))
  return {
    points,
    pointOrder: ordered.map((p) => p.id!),
    pendingPointId: null,
    savingCount: 0,
  }
}
