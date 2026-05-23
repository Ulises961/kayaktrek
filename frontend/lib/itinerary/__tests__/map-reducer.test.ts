import { describe, it, expect } from "vitest"
import { mapReducer, initialMapState } from "../map-reducer"
import type { MapState } from "../map-reducer"
import type { Point } from "@/lib/dtos/point"

const DAY0_ID = "01952f1a-0000-7000-8000-000000000010"

const pt = (id: string, dayId = DAY0_ID): Point => ({
  id,
  type: "position",
  latitude: 44,
  longitude: 14,
  dayId,
})

const BASE: MapState = {
  points: [pt("aaa"), pt("bbb"), pt("ccc")],
  pointOrder: ["aaa", "bbb", "ccc"],
  pendingPointId: null,
  savingCount: 0,
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
})
