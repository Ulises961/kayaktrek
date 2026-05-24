import { describe, it, expect } from "vitest"
import { mapReducer, initialMapState } from "../map-reducer"
import type { MapState } from "../map-reducer"
import type { Point } from "@/lib/dtos/point"
import type { Day } from "@/lib/dtos/day"

const DAY0_ID = "01952f1a-0000-7000-8000-000000000010"
const DAY1_ID = "01952f1a-0000-7000-8000-000000000020"
const ITIN_ID = "01952f1a-0000-7000-8000-000000000030"

const pt = (id: string, dayId = DAY0_ID): Point => ({
  id,
  type: "position",
  latitude: 44,
  longitude: 14,
  dayId,
})

const day = (id: string, dayNumber: number): Day => ({
  id,
  dayNumber,
  itineraryId: ITIN_ID,
})

const BASE: MapState = {
  points: [pt("aaa"), pt("bbb"), pt("ccc")],
  pointOrder: ["aaa", "bbb", "ccc"],
  pendingPointId: null,
  savingCount: 0,
  days: [],
  slideState: null,
}

describe("POINT_ADD", () => {
  it("appends the point to the list", () => {
    const next = mapReducer(BASE, { type: "POINT_ADD", point: pt("ddd") })
    expect(next.points.map((p) => p.id)).toContain("ddd")
    expect(next.points).toHaveLength(4)
  })

  it("appends the id to pointOrder", () => {
    const next = mapReducer(BASE, { type: "POINT_ADD", point: pt("ddd") })
    expect(next.pointOrder).toEqual(["aaa", "bbb", "ccc", "ddd"])
  })
})

describe("POINT_CONFIRM", () => {
  it("replaces the temp point with the confirmed point", () => {
    const state: MapState = { ...BASE, points: [...BASE.points, pt("tmp-1")], pointOrder: [...BASE.pointOrder, "tmp-1"], pendingPointId: "tmp-1" }
    const next = mapReducer(state, { type: "POINT_CONFIRM", tempId: "tmp-1", point: pt("real-1") })
    expect(next.points.map((p) => p.id)).not.toContain("tmp-1")
    expect(next.points.map((p) => p.id)).toContain("real-1")
  })

  it("replaces tempId with real id in pointOrder", () => {
    const state: MapState = { ...BASE, points: [...BASE.points, pt("tmp-1")], pointOrder: [...BASE.pointOrder, "tmp-1"] }
    const next = mapReducer(state, { type: "POINT_CONFIRM", tempId: "tmp-1", point: pt("real-1") })
    expect(next.pointOrder).toEqual(["aaa", "bbb", "ccc", "real-1"])
  })

  it("updates pendingPointId to the real id", () => {
    const state: MapState = { ...BASE, points: [pt("tmp-1")], pointOrder: ["tmp-1"], pendingPointId: "tmp-1" }
    const next = mapReducer(state, { type: "POINT_CONFIRM", tempId: "tmp-1", point: pt("real-1") })
    expect(next.pendingPointId).toBe("real-1")
  })
})

describe("POINT_ROLLBACK", () => {
  it("removes the point with the given id", () => {
    const next = mapReducer(BASE, { type: "POINT_ROLLBACK", id: "bbb" })
    expect(next.points.map((p) => p.id)).not.toContain("bbb")
  })

  it("removes the id from pointOrder", () => {
    const next = mapReducer(BASE, { type: "POINT_ROLLBACK", id: "bbb" })
    expect(next.pointOrder).toEqual(["aaa", "ccc"])
  })

  it("clears pendingPointId", () => {
    const state: MapState = { ...BASE, pendingPointId: "aaa" }
    const next = mapReducer(state, { type: "POINT_ROLLBACK", id: "aaa" })
    expect(next.pendingPointId).toBeNull()
  })
})

describe("POINT_UPDATE", () => {
  it("merges the fields into the matching point", () => {
    const next = mapReducer(BASE, { type: "POINT_UPDATE", id: "bbb", fields: { type: "stop" } })
    const updated = next.points.find((p) => p.id === "bbb")
    expect(updated?.type).toBe("stop")
  })

  it("leaves other points untouched", () => {
    const next = mapReducer(BASE, { type: "POINT_UPDATE", id: "bbb", fields: { type: "stop" } })
    expect(next.points.find((p) => p.id === "aaa")?.type).toBe("position")
  })

  it("does not change pointOrder", () => {
    const next = mapReducer(BASE, { type: "POINT_UPDATE", id: "bbb", fields: { type: "stop" } })
    expect(next.pointOrder).toEqual(BASE.pointOrder)
  })
})

describe("POINT_REMOVE", () => {
  it("removes the point with the given id", () => {
    const next = mapReducer(BASE, { type: "POINT_REMOVE", id: "ccc" })
    expect(next.points.map((p) => p.id)).not.toContain("ccc")
  })

  it("removes the id from pointOrder", () => {
    const next = mapReducer(BASE, { type: "POINT_REMOVE", id: "ccc" })
    expect(next.pointOrder).toEqual(["aaa", "bbb"])
  })

  it("clears pendingPointId when the removed point was pending", () => {
    const state: MapState = { ...BASE, pendingPointId: "aaa" }
    const next = mapReducer(state, { type: "POINT_REMOVE", id: "aaa" })
    expect(next.pendingPointId).toBeNull()
  })

  it("preserves pendingPointId when a different point is removed", () => {
    const state: MapState = { ...BASE, pendingPointId: "aaa" }
    const next = mapReducer(state, { type: "POINT_REMOVE", id: "bbb" })
    expect(next.pendingPointId).toBe("aaa")
  })
})

describe("SET_PENDING", () => {
  it("sets pendingPointId", () => {
    const next = mapReducer(BASE, { type: "SET_PENDING", id: "aaa" })
    expect(next.pendingPointId).toBe("aaa")
  })

  it("clears pendingPointId when id is null", () => {
    const state: MapState = { ...BASE, pendingPointId: "aaa" }
    const next = mapReducer(state, { type: "SET_PENDING", id: null })
    expect(next.pendingPointId).toBeNull()
  })
})

describe("SAVING_START / SAVING_END", () => {
  it("increments savingCount on SAVING_START", () => {
    const next = mapReducer(BASE, { type: "SAVING_START" })
    expect(next.savingCount).toBe(1)
  })

  it("decrements savingCount on SAVING_END", () => {
    const state: MapState = { ...BASE, savingCount: 2 }
    const next = mapReducer(state, { type: "SAVING_END" })
    expect(next.savingCount).toBe(1)
  })

  it("does not go below 0 on SAVING_END", () => {
    const next = mapReducer(BASE, { type: "SAVING_END" })
    expect(next.savingCount).toBe(0)
  })

  it("reflects multiple concurrent saves via savingCount", () => {
    let s = mapReducer(BASE, { type: "SAVING_START" })
    s = mapReducer(s, { type: "SAVING_START" })
    expect(s.savingCount).toBe(2)
    s = mapReducer(s, { type: "SAVING_END" })
    expect(s.savingCount).toBe(1)
  })
})

describe("initialMapState", () => {
  it("builds initial state from a flat points array", () => {
    const points = [pt("x"), pt("y")]
    const state = initialMapState(points)
    expect(state.points).toEqual(points)
    expect(state.pendingPointId).toBeNull()
    expect(state.savingCount).toBe(0)
  })

  it("builds pointOrder from the linked list when next refs are present", () => {
    const p1: Point = { id: "p1", type: "position", next: { id: "p2", type: "position" } }
    const p2: Point = { id: "p2", type: "position" }
    const state = initialMapState([p2, p1]) // unordered input
    expect(state.pointOrder).toEqual(["p1", "p2"])
  })

  it("initialises days from the provided array", () => {
    const d = day(DAY1_ID, 1)
    const state = initialMapState([], [d])
    expect(state.days).toHaveLength(1)
    expect(state.days[0].id).toBe(DAY1_ID)
  })

  it("defaults days to empty array when not provided", () => {
    const state = initialMapState([])
    expect(state.days).toEqual([])
    expect(state.slideState).toBeNull()
  })
})

describe("DAY_ADD", () => {
  it("appends a day to the days array", () => {
    const next = mapReducer(BASE, { type: "DAY_ADD", day: day(DAY1_ID, 1) })
    expect(next.days).toHaveLength(1)
    expect(next.days[0].id).toBe(DAY1_ID)
  })

  it("does not modify points or pointOrder", () => {
    const next = mapReducer(BASE, { type: "DAY_ADD", day: day(DAY1_ID, 1) })
    expect(next.points).toEqual(BASE.points)
    expect(next.pointOrder).toEqual(BASE.pointOrder)
  })
})

describe("DAY_UPDATE", () => {
  const stateWithDay: MapState = { ...BASE, days: [day(DAY1_ID, 1)] }

  it("merges fields into the matching day", () => {
    const next = mapReducer(stateWithDay, {
      type: "DAY_UPDATE",
      id: DAY1_ID,
      fields: { endPointId: "aaa" },
    })
    expect(next.days[0].endPointId).toBe("aaa")
  })

  it("leaves other days untouched", () => {
    const DAY2_ID = "01952f1a-0000-7000-8000-000000000021"
    const state: MapState = { ...BASE, days: [day(DAY1_ID, 1), day(DAY2_ID, 2)] }
    const next = mapReducer(state, { type: "DAY_UPDATE", id: DAY1_ID, fields: { date: "2026-06-01" } })
    expect(next.days[1].id).toBe(DAY2_ID)
    expect(next.days[1].date).toBeUndefined()
  })
})

describe("POINTS_ASSIGN", () => {
  it("updates dayId on all matching points", () => {
    const next = mapReducer(BASE, { type: "POINTS_ASSIGN", dayId: DAY1_ID, pointIds: ["aaa", "bbb"] })
    expect(next.points.find((p) => p.id === "aaa")?.dayId).toBe(DAY1_ID)
    expect(next.points.find((p) => p.id === "bbb")?.dayId).toBe(DAY1_ID)
  })

  it("leaves non-matching points unchanged", () => {
    const next = mapReducer(BASE, { type: "POINTS_ASSIGN", dayId: DAY1_ID, pointIds: ["aaa"] })
    expect(next.points.find((p) => p.id === "ccc")?.dayId).toBe(DAY0_ID)
  })

  it("does not change pointOrder", () => {
    const next = mapReducer(BASE, { type: "POINTS_ASSIGN", dayId: DAY1_ID, pointIds: ["aaa"] })
    expect(next.pointOrder).toEqual(BASE.pointOrder)
  })
})

describe("SLIDE_START", () => {
  it("sets slideState with the given values", () => {
    const next = mapReducer(BASE, {
      type: "SLIDE_START",
      dayId: DAY1_ID,
      boundaryPointId: "aaa",
      firstAssignableId: "aaa",
    })
    expect(next.slideState).toEqual({
      dayId: DAY1_ID,
      boundaryPointId: "aaa",
      firstAssignableId: "aaa",
      hoveredPointId: null,
    })
  })

  it("accepts null boundary/assignable for Day 1 initial state", () => {
    const next = mapReducer(BASE, {
      type: "SLIDE_START",
      dayId: DAY1_ID,
      boundaryPointId: null,
      firstAssignableId: null,
    })
    expect(next.slideState?.boundaryPointId).toBeNull()
    expect(next.slideState?.firstAssignableId).toBeNull()
    expect(next.slideState?.hoveredPointId).toBeNull()
  })
})

describe("SLIDE_HOVER", () => {
  const stateWithSlide: MapState = {
    ...BASE,
    slideState: { dayId: DAY1_ID, boundaryPointId: "aaa", firstAssignableId: "aaa", hoveredPointId: null },
  }

  it("updates hoveredPointId", () => {
    const next = mapReducer(stateWithSlide, { type: "SLIDE_HOVER", hoveredPointId: "bbb" })
    expect(next.slideState?.hoveredPointId).toBe("bbb")
  })

  it("is a no-op when slideState is null", () => {
    const next = mapReducer(BASE, { type: "SLIDE_HOVER", hoveredPointId: "bbb" })
    expect(next.slideState).toBeNull()
  })
})

describe("SLIDE_COMMIT", () => {
  it("clears slideState", () => {
    const state: MapState = {
      ...BASE,
      slideState: { dayId: DAY1_ID, boundaryPointId: "aaa", firstAssignableId: "aaa", hoveredPointId: "ccc" },
    }
    const next = mapReducer(state, { type: "SLIDE_COMMIT" })
    expect(next.slideState).toBeNull()
  })
})

describe("SLIDE_CANCEL", () => {
  it("clears slideState", () => {
    const state: MapState = {
      ...BASE,
      slideState: { dayId: DAY1_ID, boundaryPointId: "aaa", firstAssignableId: "aaa", hoveredPointId: null },
    }
    const next = mapReducer(state, { type: "SLIDE_CANCEL" })
    expect(next.slideState).toBeNull()
  })
})
