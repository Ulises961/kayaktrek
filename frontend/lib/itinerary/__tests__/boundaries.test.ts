import { describe, it, expect } from "vitest"
import {
  initDraftBoundaries,
  applyDraftToPreviewDays,
  computeBoundaryApplyPayload,
  type DraftBoundary,
} from "../boundaries"
import type { Day } from "@/lib/dtos/day"
import type { MapState } from "../map-reducer"
import type { Point } from "@/lib/dtos/point"

const D0 = "01952f1a-0000-7000-8000-000000000000"
const D1 = "01952f1a-0000-7000-8000-000000000001"
const D2 = "01952f1a-0000-7000-8000-000000000002"
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

describe("initDraftBoundaries", () => {
  it("maps each numbered day to a DraftBoundary with endPointIdx", () => {
    const draft = initDraftBoundaries([day1, day2], pointOrder)
    expect(draft).toHaveLength(2)
    expect(draft[0]).toMatchObject({ dayId: D1, dayNumber: 1, endPointIdx: 2 })
    expect(draft[1]).toMatchObject({ dayId: D2, dayNumber: 2, endPointIdx: 4 })
  })

  it("ignores day 0", () => {
    const draft = initDraftBoundaries([day0, day1], pointOrder)
    expect(draft).toHaveLength(1)
    expect(draft[0].dayId).toBe(D1)
  })

  it("uses pointOrder.length - 1 when endPointId is absent", () => {
    const dayNoEnd: Day = { id: D1, dayNumber: 1, itineraryId: ITIN, startPointId: PA }
    const draft = initDraftBoundaries([dayNoEnd], pointOrder)
    expect(draft[0].endPointIdx).toBe(4)
  })

  it("preserves the date from the day", () => {
    const dayWithDate: Day = { ...day1, date: "2026-07-01" }
    const draft = initDraftBoundaries([dayWithDate], pointOrder)
    expect(draft[0].date).toBe("2026-07-01")
  })

  it("returns boundaries sorted by dayNumber", () => {
    const draft = initDraftBoundaries([day2, day1], pointOrder)
    expect(draft[0].dayNumber).toBe(1)
    expect(draft[1].dayNumber).toBe(2)
  })
})

describe("applyDraftToPreviewDays", () => {
  const draft: DraftBoundary[] = [
    { dayId: D1, dayNumber: 1, endPointIdx: 1, date: null },
    { dayId: D2, dayNumber: 2, endPointIdx: 3, date: null },
  ]

  it("sets endPointId from endPointIdx for each day", () => {
    const result = applyDraftToPreviewDays(draft, [day1, day2], pointOrder)
    expect(result.find(d => d.id === D1)?.endPointId).toBe(PB)
    expect(result.find(d => d.id === D2)?.endPointId).toBe(PD)
  })

  it("sets startPointId for day 1 to pointOrder[0]", () => {
    const result = applyDraftToPreviewDays(draft, [day1, day2], pointOrder)
    expect(result.find(d => d.id === D1)?.startPointId).toBe(PA)
  })

  it("sets startPointId for day N to previous day's endPointId", () => {
    const result = applyDraftToPreviewDays(draft, [day1, day2], pointOrder)
    expect(result.find(d => d.id === D2)?.startPointId).toBe(PB)
  })

  it("preserves day 0 unchanged", () => {
    const result = applyDraftToPreviewDays(draft, [day0, day1, day2], pointOrder)
    expect(result.find(d => d.id === D0)).toEqual(day0)
  })

  it("sets date from the boundary when present", () => {
    const draftWithDate: DraftBoundary[] = [
      { dayId: D1, dayNumber: 1, endPointIdx: 1, date: "2026-07-05" },
    ]
    const result = applyDraftToPreviewDays(draftWithDate, [day1], pointOrder)
    expect(result.find(d => d.id === D1)?.date).toBe("2026-07-05")
  })
})

describe("computeBoundaryApplyPayload", () => {
  it("returns correct boundaries with start/end derived from draft", () => {
    const draft: DraftBoundary[] = [
      { dayId: D1, dayNumber: 1, endPointIdx: 2, date: "2026-07-01" },
    ]
    const state: MapState = {
      points: [pt(PA), pt(PB), pt(PC), pt(PD), pt(PE)],
      pointOrder,
      pendingPointId: null,
      pendingPointName: null,
      savingCount: 0,
      days: [day1],
    }
    const { boundaries } = computeBoundaryApplyPayload(draft, state)
    expect(boundaries).toHaveLength(1)
    expect(boundaries[0]).toMatchObject({
      dayId: D1,
      startPointId: PA,
      endPointId: PC,
      date: "2026-07-01",
    })
  })

  it("derives day 2 startPointId from day 1 endPointIdx", () => {
    const draft: DraftBoundary[] = [
      { dayId: D1, dayNumber: 1, endPointIdx: 1, date: null },
      { dayId: D2, dayNumber: 2, endPointIdx: 3, date: null },
    ]
    const state: MapState = {
      points: [pt(PA), pt(PB), pt(PC), pt(PD), pt(PE)],
      pointOrder,
      pendingPointId: null,
      pendingPointName: null,
      savingCount: 0,
      days: [day1, day2],
    }
    const { boundaries } = computeBoundaryApplyPayload(draft, state)
    expect(boundaries[1]).toMatchObject({ startPointId: PB, endPointId: PD })
  })

  it("resets old stops no longer at boundary endpoints to position", () => {
    const draft: DraftBoundary[] = [
      { dayId: D1, dayNumber: 1, endPointIdx: 1, date: null },
    ]
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
    const { points } = computeBoundaryApplyPayload(draft, state)
    const pcUpdate = points.find(p => p.id === PC)
    expect(pcUpdate).toMatchObject({ id: PC, type: "position" })
  })

  it("promotes new boundary endpoints to stop", () => {
    const draft: DraftBoundary[] = [
      { dayId: D1, dayNumber: 1, endPointIdx: 1, date: null },
    ]
    const state: MapState = {
      points: [
        pt(PA, "position", D0),
        pt(PB, "position", D0),
        pt(PC, "position", D0),
        pt(PD, "position", D0),
        pt(PE, "position", D0),
      ],
      pointOrder,
      pendingPointId: null,
      pendingPointName: null,
      savingCount: 0,
      days: [{ id: D1, dayNumber: 1, itineraryId: ITIN }],
    }
    const { points } = computeBoundaryApplyPayload(draft, state)
    expect(points.find(p => p.id === PB)).toMatchObject({ type: "stop" })
  })

  it("does not duplicate entries for the same point", () => {
    const draft: DraftBoundary[] = [
      { dayId: D1, dayNumber: 1, endPointIdx: 2, date: null },
    ]
    const state: MapState = {
      points: [pt(PA), pt(PB), pt(PC), pt(PD), pt(PE)],
      pointOrder,
      pendingPointId: null,
      pendingPointName: null,
      savingCount: 0,
      days: [{ id: D1, dayNumber: 1, itineraryId: ITIN }],
    }
    const { points } = computeBoundaryApplyPayload(draft, state)
    const ids = points.map(p => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
