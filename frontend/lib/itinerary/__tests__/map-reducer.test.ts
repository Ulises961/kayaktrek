import { describe, it, expect } from "vitest"
import { mapReducer, initialMapState } from "../map-reducer"
import type { MapState } from "../map-reducer"
import type { Point } from "@/lib/dtos/point"
import type { Day } from "@/lib/dtos/day"
import { SlidePhase } from "@/lib/types/ui"

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

  it("builds pointOrder from nextId (flat FK from API) when next is null", () => {
    const p1: Point = { id: "p1", type: "position", nextId: "p2" }
    const p2: Point = { id: "p2", type: "position", nextId: "p3" }
    const p3: Point = { id: "p3", type: "position" }
    const state = initialMapState([p3, p1, p2])
    expect(state.pointOrder).toEqual(["p1", "p2", "p3"])
  })

  it("falls back to UUID v7 sort when all points have nextId null (broken/absent linked list)", () => {
    // UUID v7 encodes creation timestamp in high bits — lexicographic sort = insertion order
    const p1: Point = { id: "01900000-0000-7000-8000-000000000001", type: "position" }
    const p2: Point = { id: "01900000-0000-7000-8000-000000000002", type: "position" }
    const p3: Point = { id: "01900000-0000-7000-8000-000000000003", type: "position" }
    const state = initialMapState([p3, p1, p2]) // unordered, no nextId
    expect(state.pointOrder).toEqual([p1.id, p2.id, p3.id])
  })

  it("hydrates dayId on points that fall within a numbered day's start/end range", () => {
    const D0 = "d0-id"
    const D1 = "d1-id"
    const p1: Point = { id: "p1", type: "position", dayId: D0, nextId: "p2" }
    const p2: Point = { id: "p2", type: "position", dayId: D0, nextId: "p3" }
    const p3: Point = { id: "p3", type: "position", dayId: D0 }
    const d1: Day = { id: D1, dayNumber: 1, itineraryId: "itin", startPointId: "p1", endPointId: "p2" }
    const state = initialMapState([p1, p2, p3], [d1])
    expect(state.points.find((p) => p.id === "p1")?.dayId).toBe(D1)
    expect(state.points.find((p) => p.id === "p2")?.dayId).toBe(D1)
    expect(state.points.find((p) => p.id === "p3")?.dayId).toBe(D0)
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

describe("DAY_REMOVE", () => {
  const DAY2_ID = "01952f1a-0000-7000-8000-000000000021"
  const DAY3_ID = "01952f1a-0000-7000-8000-000000000022"
  const stateWith3Days: MapState = {
    ...BASE,
    days: [day(DAY1_ID, 1), day(DAY2_ID, 2), day(DAY3_ID, 3)],
    points: [pt("aaa", DAY1_ID), pt("bbb", DAY2_ID), pt("ccc", DAY3_ID)],
  }

  it("removes the deleted day", () => {
    const next = mapReducer(stateWith3Days, { type: "DAY_REMOVE", id: DAY2_ID, day0Id: DAY0_ID })
    expect(next.days.find((d) => d.id === DAY2_ID)).toBeUndefined()
  })

  it("renumbers days after the gap down by one", () => {
    const next = mapReducer(stateWith3Days, { type: "DAY_REMOVE", id: DAY2_ID, day0Id: DAY0_ID })
    expect(next.days.find((d) => d.id === DAY1_ID)?.dayNumber).toBe(1)
    expect(next.days.find((d) => d.id === DAY3_ID)?.dayNumber).toBe(2)
  })

  it("reverts dayId on the deleted day's points back to day0Id", () => {
    const next = mapReducer(stateWith3Days, { type: "DAY_REMOVE", id: DAY2_ID, day0Id: DAY0_ID })
    expect(next.points.find((p) => p.id === "bbb")?.dayId).toBe(DAY0_ID)
  })

  it("leaves points of other days unchanged", () => {
    const next = mapReducer(stateWith3Days, { type: "DAY_REMOVE", id: DAY2_ID, day0Id: DAY0_ID })
    expect(next.points.find((p) => p.id === "aaa")?.dayId).toBe(DAY1_ID)
    expect(next.points.find((p) => p.id === "ccc")?.dayId).toBe(DAY3_ID)
  })

  it("cancels slideState if it targets the deleted day", () => {
    const state: MapState = {
      ...stateWith3Days,
      slideState: { dayId: DAY2_ID, phase: SlidePhase.PickEnd, boundaryPointId: "bbb", firstAssignableId: "bbb", hoveredPointId: null },
    }
    const next = mapReducer(state, { type: "DAY_REMOVE", id: DAY2_ID, day0Id: DAY0_ID })
    expect(next.slideState).toBeNull()
  })

  it("preserves slideState targeting a different day", () => {
    const state: MapState = {
      ...stateWith3Days,
      slideState: { dayId: DAY1_ID, phase: SlidePhase.PickEnd, boundaryPointId: null, firstAssignableId: null, hoveredPointId: null },
    }
    const next = mapReducer(state, { type: "DAY_REMOVE", id: DAY2_ID, day0Id: DAY0_ID })
    expect(next.slideState?.dayId).toBe(DAY1_ID)
  })
})

describe("POINTS_ASSIGN", () => {
  it("updates dayId on all matching points", () => {
    const next = mapReducer(BASE, { type: "POINTS_ASSIGN", dayId: DAY1_ID, pointIds: ["aaa", "bbb"], day0Id: DAY0_ID, startPointId: null })
    expect(next.points.find((p) => p.id === "aaa")?.dayId).toBe(DAY1_ID)
    expect(next.points.find((p) => p.id === "bbb")?.dayId).toBe(DAY1_ID)
  })

  it("leaves non-matching points unchanged when no prior assignment exists", () => {
    const next = mapReducer(BASE, { type: "POINTS_ASSIGN", dayId: DAY1_ID, pointIds: ["aaa"], day0Id: DAY0_ID, startPointId: null })
    expect(next.points.find((p) => p.id === "ccc")?.dayId).toBe(DAY0_ID)
  })

  it("does not change pointOrder", () => {
    const next = mapReducer(BASE, { type: "POINTS_ASSIGN", dayId: DAY1_ID, pointIds: ["aaa"], day0Id: DAY0_ID, startPointId: null })
    expect(next.pointOrder).toEqual(BASE.pointOrder)
  })

  it("reverts previously-assigned points outside the new range back to day0", () => {
    const state: MapState = {
      ...BASE,
      points: [pt("aaa", DAY1_ID), pt("bbb", DAY1_ID), pt("ccc", DAY1_ID)],
    }
    const next = mapReducer(state, {
      type: "POINTS_ASSIGN",
      dayId: DAY1_ID,
      pointIds: ["bbb"],
      day0Id: DAY0_ID,
      startPointId: "aaa",
    })
    expect(next.points.find((p) => p.id === "aaa")?.dayId).toBe(DAY1_ID)
    expect(next.points.find((p) => p.id === "bbb")?.dayId).toBe(DAY1_ID)
    expect(next.points.find((p) => p.id === "ccc")?.dayId).toBe(DAY0_ID)
  })

  it("preserves point type when reverting out-of-range points", () => {
    const stopPoint: Point = { ...pt("ccc", DAY1_ID), type: "stop" }
    const state: MapState = {
      ...BASE,
      points: [pt("aaa", DAY1_ID), pt("bbb", DAY1_ID), stopPoint],
    }
    const next = mapReducer(state, {
      type: "POINTS_ASSIGN",
      dayId: DAY1_ID,
      pointIds: ["bbb"],
      day0Id: DAY0_ID,
      startPointId: "aaa",
    })
    expect(next.points.find((p) => p.id === "ccc")?.type).toBe("stop")
    expect(next.points.find((p) => p.id === "ccc")?.dayId).toBe(DAY0_ID)
  })
})

describe("SLIDE_START", () => {
  it("sets slideState with the given values", () => {
    const next = mapReducer(BASE, {
      type: "SLIDE_START",
      dayId: DAY1_ID,
      phase: SlidePhase.PickEnd,
      boundaryPointId: "aaa",
      firstAssignableId: "aaa",
    })
    expect(next.slideState).toEqual({
      dayId: DAY1_ID,
      phase: SlidePhase.PickEnd,
      boundaryPointId: "aaa",
      firstAssignableId: "aaa",
      hoveredPointId: null,
    })
  })

  it("sets phase to pick_start when specified", () => {
    const next = mapReducer(BASE, {
      type: "SLIDE_START",
      dayId: DAY1_ID,
      phase: SlidePhase.PickStart,
      boundaryPointId: null,
      firstAssignableId: null,
    })
    expect(next.slideState?.phase).toBe(SlidePhase.PickStart)
  })

  it("accepts null boundary/assignable for pick_start phase", () => {
    const next = mapReducer(BASE, {
      type: "SLIDE_START",
      dayId: DAY1_ID,
      phase: SlidePhase.PickStart,
      boundaryPointId: null,
      firstAssignableId: null,
    })
    expect(next.slideState?.boundaryPointId).toBeNull()
    expect(next.slideState?.firstAssignableId).toBeNull()
    expect(next.slideState?.hoveredPointId).toBeNull()
  })

  it("always resets hoveredPointId to null on slide start", () => {
    const stateWithHover: MapState = {
      ...BASE,
      slideState: { dayId: DAY1_ID, phase: SlidePhase.PickEnd, boundaryPointId: "aaa", firstAssignableId: "aaa", hoveredPointId: "bbb" },
    }
    const next = mapReducer(stateWithHover, {
      type: "SLIDE_START",
      dayId: DAY1_ID,
      phase: SlidePhase.PickEnd,
      boundaryPointId: "aaa",
      firstAssignableId: "aaa",
    })
    expect(next.slideState?.hoveredPointId).toBeNull()
  })
})

describe("SLIDE_HOVER", () => {
  const stateWithSlide: MapState = {
    ...BASE,
    slideState: { dayId: DAY1_ID, phase: SlidePhase.PickEnd, boundaryPointId: "aaa", firstAssignableId: "aaa", hoveredPointId: null },
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
      slideState: { dayId: DAY1_ID, phase: SlidePhase.PickEnd, boundaryPointId: "aaa", firstAssignableId: "aaa", hoveredPointId: "ccc" },
    }
    const next = mapReducer(state, { type: "SLIDE_COMMIT" })
    expect(next.slideState).toBeNull()
  })
})

describe("SLIDE_CANCEL", () => {
  it("clears slideState", () => {
    const state: MapState = {
      ...BASE,
      slideState: { dayId: DAY1_ID, phase: SlidePhase.PickEnd, boundaryPointId: "aaa", firstAssignableId: "aaa", hoveredPointId: null },
    }
    const next = mapReducer(state, { type: "SLIDE_CANCEL" })
    expect(next.slideState).toBeNull()
  })

  it("reverts points outside original range to day0 when restore payload is provided", () => {
    const state: MapState = {
      ...BASE,
      points: [pt("aaa", DAY1_ID), pt("bbb", DAY1_ID), pt("ccc", DAY1_ID)],
      days: [day(DAY1_ID, 1)],
      pointOrder: ["aaa", "bbb", "ccc"],
      slideState: { dayId: DAY1_ID, phase: SlidePhase.PickEnd, boundaryPointId: "bbb", firstAssignableId: "bbb", hoveredPointId: null },
    }
    const next = mapReducer(state, {
      type: "SLIDE_CANCEL",
      restore: { dayId: DAY1_ID, startPointId: "aaa", endPointId: "bbb", day0Id: DAY0_ID },
    })
    expect(next.slideState).toBeNull()
    expect(next.points.find((p) => p.id === "aaa")?.dayId).toBe(DAY1_ID)
    expect(next.points.find((p) => p.id === "bbb")?.dayId).toBe(DAY1_ID)
    expect(next.points.find((p) => p.id === "ccc")?.dayId).toBe(DAY0_ID)
  })

  it("just clears slideState when restore payload has no startPointId", () => {
    const state: MapState = {
      ...BASE,
      slideState: { dayId: DAY1_ID, phase: SlidePhase.PickStart, boundaryPointId: null, firstAssignableId: null, hoveredPointId: null },
    }
    const next = mapReducer(state, { type: "SLIDE_CANCEL" })
    expect(next.slideState).toBeNull()
    expect(next.points).toEqual(BASE.points)
  })
})
