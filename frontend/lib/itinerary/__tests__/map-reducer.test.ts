import { describe, it, expect } from "vitest"
import { mapReducer, initialMapState } from "../map-reducer"
import type { MapState } from "../map-reducer"
import type { DraftBoundary } from "../boundaries"
import type { Point } from "@/lib/dtos/point"
import type { Day } from "@/lib/dtos/day"

const DAY0_ID = "01952f1a-0000-7000-8000-000000000010"
const DAY1_ID = "01952f1a-0000-7000-8000-000000000020"
const ITIN_ID = "01952f1a-0000-7000-8000-000000000030"
const DAY2_ID = "01952f1a-0000-7000-8000-000000000040"

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
  pendingPointName: null,
  savingCount: 0,
  days: [],
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

  it("clears pendingPointName on confirm", () => {
    const state: MapState = { ...BASE, pendingPointId: "tmp-1", pendingPointName: "Cedeira" }
    const next = mapReducer(state, { type: "POINT_CONFIRM", tempId: "tmp-1", point: pt("real-1") })
    expect(next.pendingPointName).toBeNull()
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

describe("SET_PENDING_NAME", () => {
  it("sets pendingPointName", () => {
    const next = mapReducer(BASE, { type: "SET_PENDING_NAME", name: "Cedeira harbour" })
    expect(next.pendingPointName).toBe("Cedeira harbour")
  })

  it("clears pendingPointName when name is null", () => {
    const state: MapState = { ...BASE, pendingPointName: "Cedeira harbour" }
    const next = mapReducer(state, { type: "SET_PENDING_NAME", name: null })
    expect(next.pendingPointName).toBeNull()
  })

  it("does not affect other state", () => {
    const next = mapReducer(BASE, { type: "SET_PENDING_NAME", name: "Cedeira" })
    expect(next.points).toEqual(BASE.points)
    expect(next.pointOrder).toEqual(BASE.pointOrder)
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
    expect(state.pendingPointName).toBeNull()
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
    // d1 is the last (only) day — it extends to the end so p3 is also coloured.
    expect(state.points.find((p) => p.id === "p3")?.dayId).toBe(D1)
  })

  it("last day covers trailing points beyond its stored endPointId", () => {
    const D0 = "d0-id"
    const D1 = "d1-id"
    const D2 = "d2-id"
    const p1: Point = { id: "p1", type: "position", dayId: D0, nextId: "p2" }
    const p2: Point = { id: "p2", type: "position", dayId: D0, nextId: "p3" }
    const p3: Point = { id: "p3", type: "position", dayId: D0, nextId: "p4" }
    const p4: Point = { id: "p4", type: "position", dayId: D0 }
    const d1: Day = { id: D1, dayNumber: 1, itineraryId: "itin", startPointId: "p1", endPointId: "p2" }
    // d2's endPointId was saved as p2 (a non-last point) — last day must still cover p3 and p4.
    const d2: Day = { id: D2, dayNumber: 2, itineraryId: "itin", startPointId: "p2", endPointId: "p2" }
    const state = initialMapState([p1, p2, p3, p4], [d1, d2])
    expect(state.points.find((p) => p.id === "p3")?.dayId).toBe(D2)
    expect(state.points.find((p) => p.id === "p4")?.dayId).toBe(D2)
  })

  it("assigns boundary stop to the day that ends there (not the following day)", () => {
    // Day1: p1..p2 (p2 is boundary stop)  Day2: p2..p3 (startPointId shared with Day1's end)
    // p2 must get Day1's dayId so its outgoing leg renders in Day1's colour.
    const D0 = "d0-id"
    const D1 = "d1-id"
    const D2 = "d2-id"
    const p1: Point = { id: "p1", type: "position", dayId: D0, nextId: "p2" }
    const p2: Point = { id: "p2", type: "position", dayId: D0, nextId: "p3" }
    const p3: Point = { id: "p3", type: "position", dayId: D0 }
    const d1: Day = { id: D1, dayNumber: 1, itineraryId: "itin", startPointId: "p1", endPointId: "p2" }
    const d2: Day = { id: D2, dayNumber: 2, itineraryId: "itin", startPointId: "p2", endPointId: "p3" }
    const state = initialMapState([p1, p2, p3], [d1, d2])
    expect(state.points.find((p) => p.id === "p1")?.dayId).toBe(D1)
    expect(state.points.find((p) => p.id === "p2")?.dayId).toBe(D1)  // boundary stop → Day1
    expect(state.points.find((p) => p.id === "p3")?.dayId).toBe(D2)
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
    expect(state.pendingPointName).toBeNull()
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

// ---------------------------------------------------------------------------
// §4 — BOUNDARIES_APPLY + STATE_REPLACE
// ---------------------------------------------------------------------------

const makePoint = (id: string, type: "stop" | "position" | "interest" = "position"): Point => ({
  id,
  type,
  latitude: 44,
  longitude: 14,
  dayId: DAY0_ID,
})

const APPLY_STATE: MapState = {
  points: [
    makePoint("p0"),
    makePoint("p1"),
    makePoint("p2", "stop"),  // was an old boundary endpoint
    makePoint("p3"),
    makePoint("p4"),
  ],
  pointOrder: ["p0", "p1", "p2", "p3", "p4"],
  pendingPointId: null,
  pendingPointName: null,
  savingCount: 0,
  days: [
    { id: DAY0_ID, dayNumber: 0, itineraryId: ITIN_ID },
    { id: DAY1_ID, dayNumber: 1, itineraryId: ITIN_ID, startPointId: "p0", endPointId: "p2" },
    { id: DAY2_ID, dayNumber: 2, itineraryId: ITIN_ID, startPointId: "p2", endPointId: "p4" },
  ],
}

const BOUNDARIES: DraftBoundary[] = [
  { dayId: DAY1_ID, dayNumber: 1, endPointIdx: 1, date: "2024-06-01" },
  { dayId: DAY2_ID, dayNumber: 2, endPointIdx: 4, date: "2024-06-02" },
]

const POINT_UPDATES = [{ id: "p2", type: "position" as const }]

describe("BOUNDARIES_APPLY", () => {
  it("assigns points to days by walking boundary index ranges in order", () => {
    const next = mapReducer(APPLY_STATE, {
      type: "BOUNDARIES_APPLY",
      boundaries: BOUNDARIES,
      pointUpdates: POINT_UPDATES,
      day0Id: DAY0_ID,
    })
    // BOUNDARIES: Day1 endPointIdx=1, Day2 endPointIdx=4
    // Boundary stop (p1) belongs to Day1 (the day that ends there), not Day2.
    expect(next.points.find((p) => p.id === "p0")?.dayId).toBe(DAY1_ID)
    expect(next.points.find((p) => p.id === "p1")?.dayId).toBe(DAY1_ID)
    expect(next.points.find((p) => p.id === "p2")?.dayId).toBe(DAY2_ID)
    expect(next.points.find((p) => p.id === "p3")?.dayId).toBe(DAY2_ID)
    expect(next.points.find((p) => p.id === "p4")?.dayId).toBe(DAY2_ID)
  })

  it("promotes new boundary points to type stop when no dirty override exists", () => {
    const next = mapReducer(APPLY_STATE, {
      type: "BOUNDARIES_APPLY",
      boundaries: BOUNDARIES,
      pointUpdates: POINT_UPDATES,
      day0Id: DAY0_ID,
    })
    expect(next.points.find((p) => p.id === "p0")?.type).toBe("stop")
    expect(next.points.find((p) => p.id === "p1")?.type).toBe("stop")
    expect(next.points.find((p) => p.id === "p4")?.type).toBe("stop")
  })

  it("applies dirty type override from pointUpdates (demoted boundary stop → position)", () => {
    const next = mapReducer(APPLY_STATE, {
      type: "BOUNDARIES_APPLY",
      boundaries: BOUNDARIES,
      pointUpdates: POINT_UPDATES,
      day0Id: DAY0_ID,
    })
    expect(next.points.find((p) => p.id === "p2")?.type).toBe("position")
  })

  it("leaves non-boundary non-dirty points with their existing type", () => {
    const next = mapReducer(APPLY_STATE, {
      type: "BOUNDARIES_APPLY",
      boundaries: BOUNDARIES,
      pointUpdates: POINT_UPDATES,
      day0Id: DAY0_ID,
    })
    expect(next.points.find((p) => p.id === "p3")?.type).toBe("position")
  })

  it("applies name from pointUpdates when provided", () => {
    const updates = [{ id: "p1", type: "stop" as const, name: "Cedeira harbour" }]
    const next = mapReducer(APPLY_STATE, {
      type: "BOUNDARIES_APPLY",
      boundaries: BOUNDARIES,
      pointUpdates: updates,
      day0Id: DAY0_ID,
    })
    expect(next.points.find((p) => p.id === "p1")?.name).toBe("Cedeira harbour")
  })

  it("updates day startPointId, endPointId and date from the new boundaries", () => {
    const next = mapReducer(APPLY_STATE, {
      type: "BOUNDARIES_APPLY",
      boundaries: BOUNDARIES,
      pointUpdates: POINT_UPDATES,
      day0Id: DAY0_ID,
    })
    const d1 = next.days.find((d) => d.id === DAY1_ID)!
    const d2 = next.days.find((d) => d.id === DAY2_ID)!
    expect(d1.startPointId).toBe("p0")
    expect(d1.endPointId).toBe("p1")
    expect(d1.date).toBe("2024-06-01")
    expect(d2.startPointId).toBe("p1")
    expect(d2.endPointId).toBe("p4")
    expect(d2.date).toBe("2024-06-02")
  })

  it("leaves day 0 unchanged", () => {
    const next = mapReducer(APPLY_STATE, {
      type: "BOUNDARIES_APPLY",
      boundaries: BOUNDARIES,
      pointUpdates: POINT_UPDATES,
      day0Id: DAY0_ID,
    })
    expect(next.days.find((d) => d.id === DAY0_ID)).toEqual(APPLY_STATE.days[0])
  })

  it("last boundary extends to cover points beyond its endPointIdx", () => {
    const state: MapState = {
      ...APPLY_STATE,
      points: [...APPLY_STATE.points, makePoint("p5")],
      pointOrder: [...APPLY_STATE.pointOrder, "p5"],
    }
    const next = mapReducer(state, {
      type: "BOUNDARIES_APPLY",
      boundaries: BOUNDARIES,        // last boundary endPointIdx=4, p5 is at idx 5
      pointUpdates: POINT_UPDATES,
      day0Id: DAY0_ID,
    })
    // The last boundary auto-extends to pointOrder.length-1 so p5 belongs to the last day.
    expect(next.points.find((p) => p.id === "p5")?.dayId).toBe(DAY2_ID)
  })

  it("does not change pointOrder", () => {
    const next = mapReducer(APPLY_STATE, {
      type: "BOUNDARIES_APPLY",
      boundaries: BOUNDARIES,
      pointUpdates: POINT_UPDATES,
      day0Id: DAY0_ID,
    })
    expect(next.pointOrder).toEqual(APPLY_STATE.pointOrder)
  })
})

describe("STATE_REPLACE", () => {
  it("replaces the entire state with the provided state", () => {
    const replacement: MapState = { ...BASE, savingCount: 42, pendingPointId: "aaa" }
    const next = mapReducer(APPLY_STATE, { type: "STATE_REPLACE", state: replacement })
    expect(next).toEqual(replacement)
  })
})
