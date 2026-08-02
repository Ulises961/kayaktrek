import { describe, it, expect } from "vitest"
import {
  initDaySlices,
  applySlicesToPreviewDays,
  computeSlicesApplyPayload,
  isDraftDay,
  latestDatedSliceDate,
  resolveDraft,
  initDraftBoundaries,
  appendDraftBoundary,
  removeDraftBoundary,
  type DaySlice,
  type DraftBoundary,
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

// ─── isDraftDay ───────────────────────────────────────────────────────────────

describe("isDraftDay", () => {
  it("is true for a synthetic draft-N id", () => {
    expect(isDraftDay("draft-1")).toBe(true)
  })

  it("is false for a real UUID day id", () => {
    expect(isDraftDay(D1)).toBe(false)
  })
})

// ─── latestDatedSliceDate ─────────────────────────────────────────────────────

describe("latestDatedSliceDate", () => {
  it("returns the date of the slice at index when it has one", () => {
    const slices: DaySlice[] = [
      { dayId: D1, dayNumber: 1, startIdx: 0, endIdx: 1, date: "2026-07-01" },
      { dayId: D2, dayNumber: 2, startIdx: 1, endIdx: 2, date: "2026-07-03" },
    ]
    expect(latestDatedSliceDate(slices, 1)).toBe("2026-07-03")
  })

  it("walks backward to the nearest earlier dated slice when the one at index has none", () => {
    const slices: DaySlice[] = [
      { dayId: D1, dayNumber: 1, startIdx: 0, endIdx: 1, date: "2026-07-01" },
      { dayId: D2, dayNumber: 2, startIdx: 1, endIdx: 2, date: null },
      { dayId: D3, dayNumber: 3, startIdx: 2, endIdx: 3, date: null },
    ]
    expect(latestDatedSliceDate(slices, 2)).toBe("2026-07-01")
  })

  it("returns undefined when no earlier slice (inclusive) has a date", () => {
    const slices: DaySlice[] = [
      { dayId: D1, dayNumber: 1, startIdx: 0, endIdx: 1, date: null },
      { dayId: D2, dayNumber: 2, startIdx: 1, endIdx: 2, date: null },
    ]
    expect(latestDatedSliceDate(slices, 1)).toBeUndefined()
  })

  it("returns undefined for a negative index (day 1 has nothing before it)", () => {
    const slices: DaySlice[] = [{ dayId: D1, dayNumber: 1, startIdx: 0, endIdx: 1, date: null }]
    expect(latestDatedSliceDate(slices, -1)).toBeUndefined()
  })
})

// ─── resolveDraft ───────────────────────────────────────────────────────────

describe("resolveDraft", () => {
  it("resolves a normal multi-day draft: each day's start is the previous day's end", () => {
    const draft: DraftBoundary[] = [
      { dayId: D1, dayNumber: 1, endPointId: PC, date: null },
      { dayId: D2, dayNumber: 2, endPointId: PE, date: null },
    ]
    expect(resolveDraft(draft, pointOrder)).toEqual([
      { dayId: D1, dayNumber: 1, startIdx: 0, endIdx: 2, date: null },
      { dayId: D2, dayNumber: 2, startIdx: 2, endIdx: 4, date: null },
    ])
  })

  it("last-day tail rule: the last day's endIdx is always M-1, ignoring its stored endPointId", () => {
    const draft: DraftBoundary[] = [{ dayId: D1, dayNumber: 1, endPointId: PB, date: null }]
    const [slice] = resolveDraft(draft, pointOrder)
    expect(slice).toMatchObject({ startIdx: 0, endIdx: 4 })
  })

  it("anchor loss (null endPointId on a non-last day) clamps to a zero-length day", () => {
    const draft: DraftBoundary[] = [
      { dayId: D1, dayNumber: 1, endPointId: null, date: null },
      { dayId: D2, dayNumber: 2, endPointId: PE, date: null },
    ]
    const slices = resolveDraft(draft, pointOrder)
    expect(slices[0]).toMatchObject({ startIdx: 0, endIdx: 0 })
    expect(slices[1]).toMatchObject({ startIdx: 0, endIdx: 4 })
  })

  it("anchor loss (stale endPointId not in pointOrder) clamps to a zero-length day", () => {
    const draft: DraftBoundary[] = [
      { dayId: D1, dayNumber: 1, endPointId: "no-longer-exists", date: null },
      { dayId: D2, dayNumber: 2, endPointId: PE, date: null },
    ]
    const slices = resolveDraft(draft, pointOrder)
    expect(slices[0]).toMatchObject({ startIdx: 0, endIdx: 0 })
  })

  it("monotonicity: an anchor pointing backwards clamps to the day's own startIdx", () => {
    const draft: DraftBoundary[] = [
      { dayId: D1, dayNumber: 1, endPointId: PC, date: null }, // idx 2
      { dayId: D2, dayNumber: 2, endPointId: PB, date: null }, // idx 1 — before day 2's start
      { dayId: D3, dayNumber: 3, endPointId: PE, date: null },
    ]
    const slices = resolveDraft(draft, pointOrder)
    expect(slices[0]).toMatchObject({ startIdx: 0, endIdx: 2 })
    expect(slices[1]).toMatchObject({ startIdx: 2, endIdx: 2 }) // clamped, zero-length
    expect(slices[2]).toMatchObject({ startIdx: 2, endIdx: 4 }) // tail rule
  })

  it("M === 0: every slice is explicitly empty (startIdx 0, endIdx -1)", () => {
    const draft: DraftBoundary[] = [
      { dayId: D1, dayNumber: 1, endPointId: "irrelevant", date: "2026-07-01" },
      { dayId: D2, dayNumber: 2, endPointId: null, date: null },
    ]
    expect(resolveDraft(draft, [])).toEqual([
      { dayId: D1, dayNumber: 1, startIdx: 0, endIdx: -1, date: "2026-07-01" },
      { dayId: D2, dayNumber: 2, startIdx: 0, endIdx: -1, date: null },
    ])
  })
})

// ─── initDraftBoundaries + round-trip invariant ────────────────────────────

describe("initDraftBoundaries", () => {
  it("materializes a draft from real Day rows via initDaySlices", () => {
    const draft = initDraftBoundaries([day1, day2], pointOrder)
    expect(draft).toEqual([
      { dayId: D1, dayNumber: 1, endPointId: PC, date: null },
      { dayId: D2, dayNumber: 2, endPointId: PE, date: null },
    ])
  })

  it("round-trips through resolveDraft back to initDaySlices for saved-boundary days", () => {
    const days = [day1, day2]
    expect(resolveDraft(initDraftBoundaries(days, pointOrder), pointOrder)).toEqual(
      initDaySlices(days, pointOrder),
    )
  })

  it("round-trips for days with no saved endPointId (even-spread fallback exercised)", () => {
    const freshDay1: Day = { id: D1, dayNumber: 1, itineraryId: ITIN }
    const freshDay2: Day = { id: D2, dayNumber: 2, itineraryId: ITIN }
    const freshDay3: Day = { id: D3, dayNumber: 3, itineraryId: ITIN }
    const days = [freshDay1, freshDay2, freshDay3]
    expect(resolveDraft(initDraftBoundaries(days, pointOrder), pointOrder)).toEqual(
      initDaySlices(days, pointOrder),
    )
  })
})

// ─── appendDraftBoundary ────────────────────────────────────────────────────

describe("appendDraftBoundary", () => {
  it("on an empty draft: Day 1 spans everything", () => {
    const result = appendDraftBoundary([], pointOrder)
    expect(result).toEqual([{ dayId: "draft-1", dayNumber: 1, endPointId: null, date: null }])
    expect(resolveDraft(result, pointOrder)).toEqual([
      { dayId: "draft-1", dayNumber: 1, startIdx: 0, endIdx: 4, date: null },
    ])
  })

  it("collapse-and-drag on a one-day draft: new day takes over all points, old day zero-length", () => {
    const tenPoints = Array.from({ length: 10 }, (_, i) => `p${i}`)
    const oneDay = appendDraftBoundary([], tenPoints) // [{ draft-1, endPointId: null }]

    const result = appendDraftBoundary(oneDay, tenPoints)
    expect(result).toEqual([
      { dayId: "draft-1", dayNumber: 1, endPointId: "p0", date: null },
      { dayId: "draft-2", dayNumber: 2, endPointId: null, date: null },
    ])

    // Worked example from the plan: Day 1 owns just p0, Day 2 owns p1..p9.
    expect(resolveDraft(result, tenPoints)).toEqual([
      { dayId: "draft-1", dayNumber: 1, startIdx: 0, endIdx: 0, date: null },
      { dayId: "draft-2", dayNumber: 2, startIdx: 0, endIdx: 9, date: null },
    ])
  })

  it("collapse-and-drag on a multi-day draft: only the old last day collapses, earlier days untouched", () => {
    const draft: DraftBoundary[] = [
      { dayId: D1, dayNumber: 1, endPointId: PC, date: null },
      { dayId: D2, dayNumber: 2, endPointId: PE, date: null },
    ]
    const result = appendDraftBoundary(draft, pointOrder)
    expect(result[0]).toEqual(draft[0]) // day 1 untouched
    expect(result[1]).toMatchObject({ dayId: D2, endPointId: PC }) // collapsed to its own start
    expect(result[2]).toMatchObject({ dayNumber: 3, endPointId: null })

    // Assert the resolved slices, not just the raw draft — proves the intent.
    expect(resolveDraft(result, pointOrder)).toEqual([
      { dayId: D1, dayNumber: 1, startIdx: 0, endIdx: 2, date: null },
      { dayId: D2, dayNumber: 2, startIdx: 2, endIdx: 2, date: null }, // zero-length
      { dayId: result[2].dayId, dayNumber: 3, startIdx: 2, endIdx: 4, date: null },
    ])
  })

  it("draft-id uniqueness: fills the smallest available gap, not just the next sequential number", () => {
    // Simulates a draft where draft-2 was previously removed, leaving a gap.
    const draft: DraftBoundary[] = [
      { dayId: "draft-1", dayNumber: 1, endPointId: PC, date: null },
      { dayId: "draft-3", dayNumber: 2, endPointId: null, date: null },
    ]
    const result = appendDraftBoundary(draft, pointOrder)
    expect(result[2].dayId).toBe("draft-2")
  })

  it("draft-id uniqueness across a remove-then-append cycle", () => {
    const afterFirstAppend = appendDraftBoundary([], pointOrder) // draft-1
    const afterSecondAppend = appendDraftBoundary(afterFirstAppend, pointOrder) // draft-1, draft-2
    const afterRemove = removeDraftBoundary(afterSecondAppend, "draft-2") // back to just draft-1
    const afterThirdAppend = appendDraftBoundary(afterRemove, pointOrder)
    expect(afterThirdAppend[1].dayId).toBe("draft-2")
    expect(new Set(afterThirdAppend.map((d) => d.dayId)).size).toBe(afterThirdAppend.length)
  })
})

// ─── removeDraftBoundary ────────────────────────────────────────────────────

describe("removeDraftBoundary", () => {
  it("removing the only day leaves an empty array", () => {
    const draft: DraftBoundary[] = [
      { dayId: "draft-1", dayNumber: 1, endPointId: null, date: null },
    ]
    expect(removeDraftBoundary(draft, "draft-1")).toEqual([])
  })

  it("removing a middle day: the previous day absorbs its endPointId, remaining days renumber", () => {
    const draft: DraftBoundary[] = [
      { dayId: D1, dayNumber: 1, endPointId: PB, date: null },
      { dayId: "draft-2", dayNumber: 2, endPointId: PC, date: null },
      { dayId: D3, dayNumber: 3, endPointId: PE, date: null },
    ]
    const result = removeDraftBoundary(draft, "draft-2")
    expect(result).toEqual([
      { dayId: D1, dayNumber: 1, endPointId: PC, date: null },
      { dayId: D3, dayNumber: 2, endPointId: PE, date: null },
    ])
  })

  it("removing the first day: just drops it, nothing to patch, remaining days renumber", () => {
    const draft: DraftBoundary[] = [
      { dayId: "draft-1", dayNumber: 1, endPointId: PB, date: null },
      { dayId: D2, dayNumber: 2, endPointId: PE, date: null },
    ]
    const result = removeDraftBoundary(draft, "draft-1")
    expect(result).toEqual([{ dayId: D2, dayNumber: 1, endPointId: PE, date: null }])
  })

  it("is a no-op when the dayId is not found", () => {
    const draft: DraftBoundary[] = [{ dayId: D1, dayNumber: 1, endPointId: PC, date: null }]
    expect(removeDraftBoundary(draft, "does-not-exist")).toEqual(draft)
  })
})
