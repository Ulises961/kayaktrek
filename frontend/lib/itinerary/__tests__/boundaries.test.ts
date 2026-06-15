import { describe, it, expect } from "vitest"
import {
  initDaySlices,
  applySlicesToPreviewDays,
  computeSlicesApplyPayload,
  type DaySlice,
} from "../boundaries"
import type { Day } from "@/lib/dtos/day"
import type { MapState } from "../map-reducer"
import type { Point } from "@/lib/dtos/point"

const D0 = "01952f1a-0000-7000-8000-000000000000"
const D1 = "01952f1a-0000-7000-8000-000000000001"
const D2 = "01952f1a-0000-7000-8000-000000000002"
const D3 = "01952f1a-0000-7000-8000-000000000003"
const ITIN = "01952f1a-0000-7000-8000-000000000010"
const PA = "01952f1a-0000-7000-8000-0000000000aa"
const PB = "01952f1a-0000-7000-8000-0000000000ab"
const PC = "01952f1a-0000-7000-8000-0000000000ac"
const PD = "01952f1a-0000-7000-8000-0000000000ad"
const PE = "01952f1a-0000-7000-8000-0000000000ae"

const pointOrder = [PA, PB, PC, PD, PE]

const day0: Day = { id: D0, dayNumber: 0, itineraryId: ITIN }
const day1: Day = { id: D1, dayNumber: 1, itineraryId: ITIN, startPointId: PA, endPointId: PC }
const day2: Day = { id: D2, dayNumber: 2, itineraryId: ITIN, startPointId: PC, endPointId: PE }

const pt = (id: string, type: "stop" | "position" = "position", dayId = D0): Point => ({
  id,
  type,
  latitude: 44,
  longitude: 14,
  dayId,
})

// ─── initDaySlices ────────────────────────────────────────────────────────────

describe("initDaySlices", () => {
  it("maps each numbered day to a DaySlice with explicit startIdx and endIdx", () => {
    const slices = initDaySlices([day1, day2], pointOrder)
    expect(slices).toHaveLength(2)
    expect(slices[0]).toMatchObject({ dayId: D1, dayNumber: 1, startIdx: 0, endIdx: 2 })
    expect(slices[1]).toMatchObject({ dayId: D2, dayNumber: 2, startIdx: 2, endIdx: 4 })
  })

  it("day 2+ startIdx equals day 1 endIdx (shared boundary stop)", () => {
    const slices = initDaySlices([day1, day2], pointOrder)
    expect(slices[1].startIdx).toBe(slices[0].endIdx)
  })

  it("ignores day 0", () => {
    const slices = initDaySlices([day0, day1], pointOrder)
    expect(slices).toHaveLength(1)
    expect(slices[0].dayId).toBe(D1)
  })

  it("single day with no endPointId: endIdx = M-1", () => {
    const dayNoEnd: Day = { id: D1, dayNumber: 1, itineraryId: ITIN, startPointId: PA }
    const slices = initDaySlices([dayNoEnd], pointOrder)
    expect(slices[0]).toMatchObject({ startIdx: 0, endIdx: 4 })
  })

  it("last slice always extends to M-1 even when endPointId stops short", () => {
    // day1 ends at PC (index 2), day2 endPointId is PD (index 3) — but as the last
    // day it must cover through PE (index 4) so tail-orphan points are never stranded.
    const day2Short: Day = {
      id: D2,
      dayNumber: 2,
      itineraryId: ITIN,
      startPointId: PC,
      endPointId: PD,
    }
    const slices = initDaySlices([day1, day2Short], pointOrder)
    expect(slices[1].endIdx).toBe(4) // forced to M-1
  })

  it("tail-orphan points beyond the last boundary are absorbed into the last slice", () => {
    // Route has 5 points; day1 covers only PA-PC. After day2 is deleted, day1
    // becomes the last day — its slice must reach PE so PD and PE aren't stranded.
    const slices = initDaySlices([day1], pointOrder)
    expect(slices[0].endIdx).toBe(4) // M-1, not 2 (PC)
  })

  it("in-between orphan: last slice stretches back via startIdx and forward to M-1", () => {
    // day1 covers PA-PB (endIdx 1), day2 was deleted, day3 (now day2) covered PE.
    // After deletion day2's startIdx = day1's endIdx = 1, endIdx = M-1 = 4.
    const formerDay3: Day = {
      id: D3,
      dayNumber: 2,
      itineraryId: ITIN,
      startPointId: PC,
      endPointId: PE,
    }
    const slices = initDaySlices([day1, formerDay3], pointOrder)
    expect(slices[1].startIdx).toBe(slices[0].endIdx) // shares boundary stop with day1
    expect(slices[1].endIdx).toBe(4) // extends to end
  })

  it("spreads fresh days (no endPointId) evenly with distinct indices", () => {
    const freshDay1: Day = { id: D1, dayNumber: 1, itineraryId: ITIN }
    const freshDay2: Day = { id: D2, dayNumber: 2, itineraryId: ITIN }
    const freshDay3: Day = { id: D3, dayNumber: 3, itineraryId: ITIN }
    const slices = initDaySlices([freshDay1, freshDay2, freshDay3], pointOrder)
    const endIndices = slices.map((s) => s.endIdx)
    expect(new Set(endIndices).size).toBe(3)
    expect(endIndices[0]).toBeLessThan(endIndices[1])
    expect(endIndices[1]).toBeLessThan(endIndices[2])
  })

  it("preserves date from the day", () => {
    const dayWithDate: Day = { ...day1, date: "2026-07-01" }
    const slices = initDaySlices([dayWithDate], pointOrder)
    expect(slices[0].date).toBe("2026-07-01")
  })

  it("returns slices sorted by dayNumber", () => {
    const slices = initDaySlices([day2, day1], pointOrder)
    expect(slices[0].dayNumber).toBe(1)
    expect(slices[1].dayNumber).toBe(2)
  })
})

// ─── applySlicesToPreviewDays ────────────────────────────────────────────────

describe("applySlicesToPreviewDays", () => {
  const slices: DaySlice[] = [
    { dayId: D1, dayNumber: 1, startIdx: 0, endIdx: 1, date: null },
    { dayId: D2, dayNumber: 2, startIdx: 1, endIdx: 3, date: null },
  ]

  it("sets startPointId and endPointId from slice indices", () => {
    const result = applySlicesToPreviewDays(slices, [day1, day2], pointOrder)
    expect(result.find((d) => d.id === D1)?.startPointId).toBe(PA)
    expect(result.find((d) => d.id === D1)?.endPointId).toBe(PB)
    expect(result.find((d) => d.id === D2)?.startPointId).toBe(PB)
    expect(result.find((d) => d.id === D2)?.endPointId).toBe(PD)
  })

  it("preserves day 0 unchanged", () => {
    const result = applySlicesToPreviewDays(slices, [day0, day1, day2], pointOrder)
    expect(result.find((d) => d.id === D0)).toEqual(day0)
  })

  it("sets date from the slice when present", () => {
    const slicesWithDate: DaySlice[] = [
      { dayId: D1, dayNumber: 1, startIdx: 0, endIdx: 1, date: "2026-07-05" },
    ]
    const result = applySlicesToPreviewDays(slicesWithDate, [day1], pointOrder)
    expect(result.find((d) => d.id === D1)?.date).toBe("2026-07-05")
  })

  it("empty day (startIdx > endIdx): startPointId and endPointId are null", () => {
    const emptySlice: DaySlice[] = [
      { dayId: D1, dayNumber: 1, startIdx: 0, endIdx: 4, date: null },
      { dayId: D2, dayNumber: 2, startIdx: 5, endIdx: 4, date: null }, // empty
    ]
    const result = applySlicesToPreviewDays(emptySlice, [day1, day2], pointOrder)
    const d2 = result.find((d) => d.id === D2)
    expect(d2?.startPointId).toBeNull()
    expect(d2?.endPointId).toBeNull()
  })
})

// ─── computeSlicesApplyPayload ────────────────────────────────────────────────

describe("computeSlicesApplyPayload", () => {
  it("returns correct boundaries with start/end derived from slice indices", () => {
    const slices: DaySlice[] = [
      { dayId: D1, dayNumber: 1, startIdx: 0, endIdx: 2, date: "2026-07-01" },
    ]
    const state: MapState = {
      points: [pt(PA), pt(PB), pt(PC), pt(PD), pt(PE)],
      pointOrder,
      pendingPointId: null,
      pendingPointName: null,
      savingCount: 0,
      days: [day1],
    }
    const { boundaries } = computeSlicesApplyPayload(slices, state)
    expect(boundaries).toHaveLength(1)
    expect(boundaries[0]).toMatchObject({
      dayId: D1,
      startPointId: PA,
      endPointId: PC,
      date: "2026-07-01",
    })
  })

  it("day 2 startPointId equals day 1 endPointId (shared boundary stop)", () => {
    const slices: DaySlice[] = [
      { dayId: D1, dayNumber: 1, startIdx: 0, endIdx: 1, date: null },
      { dayId: D2, dayNumber: 2, startIdx: 1, endIdx: 3, date: null },
    ]
    const state: MapState = {
      points: [pt(PA), pt(PB), pt(PC), pt(PD), pt(PE)],
      pointOrder,
      pendingPointId: null,
      pendingPointName: null,
      savingCount: 0,
      days: [day1, day2],
    }
    const { boundaries } = computeSlicesApplyPayload(slices, state)
    expect(boundaries[0].endPointId).toBe(PB)
    expect(boundaries[1].startPointId).toBe(PB)
  })

  it("resets old stops no longer at boundary endpoints to position", () => {
    const slices: DaySlice[] = [{ dayId: D1, dayNumber: 1, startIdx: 0, endIdx: 1, date: null }]
    const state: MapState = {
      points: [
        pt(PA, "stop", D1),
        pt(PB, "position", D0),
        pt(PC, "stop", D1),
        pt(PD, "position", D0),
        pt(PE, "position", D0),
      ],
      pointOrder,
      pendingPointId: null,
      pendingPointName: null,
      savingCount: 0,
      days: [{ ...day1, startPointId: PA, endPointId: PC }],
    }
    const { points } = computeSlicesApplyPayload(slices, state)
    expect(points.find((p) => p.id === PC)).toMatchObject({ type: "position" })
  })

  it("promotes new boundary endpoints to stop", () => {
    const slices: DaySlice[] = [{ dayId: D1, dayNumber: 1, startIdx: 0, endIdx: 1, date: null }]
    const state: MapState = {
      points: [pt(PA), pt(PB), pt(PC), pt(PD), pt(PE)],
      pointOrder,
      pendingPointId: null,
      pendingPointName: null,
      savingCount: 0,
      days: [{ id: D1, dayNumber: 1, itineraryId: ITIN }],
    }
    const { points } = computeSlicesApplyPayload(slices, state)
    expect(points.find((p) => p.id === PB)).toMatchObject({ type: "stop" })
  })

  it("does not duplicate entries for the same point", () => {
    const slices: DaySlice[] = [{ dayId: D1, dayNumber: 1, startIdx: 0, endIdx: 2, date: null }]
    const state: MapState = {
      points: [pt(PA), pt(PB), pt(PC), pt(PD), pt(PE)],
      pointOrder,
      pendingPointId: null,
      pendingPointName: null,
      savingCount: 0,
      days: [{ id: D1, dayNumber: 1, itineraryId: ITIN }],
    }
    const { points } = computeSlicesApplyPayload(slices, state)
    const ids = points.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("empty day is omitted from the boundaries payload (not sent to backend)", () => {
    const slices: DaySlice[] = [
      { dayId: D1, dayNumber: 1, startIdx: 0, endIdx: 4, date: null },
      { dayId: D2, dayNumber: 2, startIdx: 5, endIdx: 4, date: null }, // empty
    ]
    const state: MapState = {
      points: [pt(PA), pt(PB), pt(PC), pt(PD), pt(PE)],
      pointOrder,
      pendingPointId: null,
      pendingPointName: null,
      savingCount: 0,
      days: [day1, day2],
    }
    const { boundaries } = computeSlicesApplyPayload(slices, state)
    expect(boundaries).toHaveLength(1)
    expect(boundaries[0].dayId).toBe(D1)
  })
})
