import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createElement } from "react"
import { MapBuilderContext } from "@/lib/itinerary/map-builder-context"
import type { MapBuilderContextValue } from "@/lib/itinerary/map-builder-context"
import type { MapState } from "@/lib/itinerary/map-reducer"
import type { DaySlice } from "@/lib/itinerary/boundaries"
import type { Point } from "@/lib/dtos/point"
import type { Day } from "@/lib/dtos/day"

vi.mock("@/lib/itinerary/actions", () => ({
  createDay: vi.fn().mockResolvedValue({
    success: true,
    day: { id: "new-day", dayNumber: 1, itineraryId: "itin" },
  }),
  deleteDay: vi.fn().mockResolvedValue({ success: true }),
  updateDay: vi.fn().mockResolvedValue({ success: true }),
  updatePoint: vi.fn().mockResolvedValue({ success: true }),
  deletePoint: vi.fn().mockResolvedValue({ success: true }),
  applyBoundaries: vi
    .fn()
    .mockResolvedValue({ success: true, itinerary: { id: "itin-1", days: [] } }),
}))

vi.mock("@/lib/itinerary/boundaries", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/itinerary/boundaries")>()
  return {
    ...actual,
    initDaySlices: vi.fn(actual.initDaySlices),
  }
})

import { PointListPane } from "../point-list-pane"
import * as boundaries from "@/lib/itinerary/boundaries"
import * as actions from "@/lib/itinerary/actions"

const DAY0_ID = "day-0"
const DAY1_ID = "day-1"
const DAY2_ID = "day-2"
const ITIN_ID = "itin-1"

const pt = (id: string, dayId = DAY0_ID): Point => ({
  id,
  type: "position",
  latitude: 44,
  longitude: 14,
  dayId,
})

const day = (id: string, dayNumber: number, extra: Partial<Day> = {}): Day => ({
  id,
  dayNumber,
  itineraryId: ITIN_ID,
  ...extra,
})

function makeCtx(overrides: Partial<MapBuilderContextValue> = {}): MapBuilderContextValue {
  const state: MapState = {
    points: [pt("p1"), pt("p2"), pt("p3")],
    pointOrder: ["p1", "p2", "p3"],
    pendingPointId: null,
    pendingPointName: null,
    savingCount: 0,
    days: [],
    ...overrides.state,
  }
  return {
    state,
    dispatch: vi.fn(),
    draftSlices: null,
    setDraftSlices: vi.fn(),
    tripId: null,
    itineraryId: ITIN_ID,
    distanceUnit: "nm",
    setDistanceUnit: vi.fn(),
    avgSpeedKnots: 2.5,
    setAvgSpeedKnots: vi.fn(),
    activePointId: null,
    setActivePointId: vi.fn(),
    day0Id: DAY0_ID,
    viewMode: false,
    setViewMode: vi.fn(),
    selectedDayId: null,
    setSelectedDayId: vi.fn(),
    tripState: null,
    isLeader: true,
    selectedPointId: null,
    setSelectedPointId: vi.fn(),
    selectedHour: 12,
    setSelectedHour: vi.fn(),
    ...overrides,
  }
}

function renderWithCtx(ctx: MapBuilderContextValue) {
  return render(
    createElement(MapBuilderContext.Provider, { value: ctx }, createElement(PointListPane)),
  )
}

beforeEach(() => vi.clearAllMocks())

// ─── drop mode ───────────────────────────────────────────────────────────────

describe("PointListPane — drop mode (no draftSlices)", () => {
  it("renders a row for each point in pointOrder", () => {
    renderWithCtx(makeCtx())
    expect(screen.getAllByTestId("point-row")).toHaveLength(3)
  })

  it("shows 'Edit boundaries' button when days exist", () => {
    const ctx = makeCtx({
      state: {
        points: [pt("p1", DAY1_ID)],
        pointOrder: ["p1"],
        pendingPointId: null,
        pendingPointName: null,
        savingCount: 0,
        days: [day(DAY1_ID, 1, { startPointId: "p1" })],
      },
    })
    renderWithCtx(ctx)
    expect(screen.getByRole("button", { name: /edit boundaries/i })).toBeInTheDocument()
  })

  it("shows 'Add day' button", () => {
    renderWithCtx(makeCtx())
    expect(screen.getByRole("button", { name: /add day/i })).toBeInTheDocument()
  })

  it("does not show 'Apply' or 'Cancel' in drop mode", () => {
    renderWithCtx(makeCtx())
    expect(screen.queryByRole("button", { name: /apply/i })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /cancel/i })).not.toBeInTheDocument()
  })

  it("auto-expands the pending point row", () => {
    const ctx = makeCtx({
      state: {
        points: [pt("p1"), pt("p2"), pt("p3")],
        pointOrder: ["p1", "p2", "p3"],
        pendingPointId: "p2",
        pendingPointName: null,
        savingCount: 0,
        days: [],
      },
    })
    renderWithCtx(ctx)
    expect(screen.getByRole("button", { name: /stop/i })).toBeInTheDocument()
  })
})

// ─── boundary-edit mode ───────────────────────────────────────────────────────

describe("PointListPane — boundary-edit mode (draftSlices non-null)", () => {
  const draft: DaySlice[] = [{ dayId: DAY1_ID, dayNumber: 1, startIdx: 0, endIdx: 1, date: null }]

  it("shows 'Apply' and 'Cancel' buttons when draftSlices is non-null", () => {
    const ctx = makeCtx({ draftSlices: draft })
    renderWithCtx(ctx)
    expect(screen.getByRole("button", { name: /apply/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument()
  })

  it("does not show 'Edit boundaries' or 'Add day' in boundary-edit mode", () => {
    const ctx = makeCtx({ draftSlices: draft })
    renderWithCtx(ctx)
    expect(screen.queryByRole("button", { name: /edit boundaries/i })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /add day/i })).not.toBeInTheDocument()
  })

  it("renders N-1 BoundaryDividers for N slices (last slice has no following day)", () => {
    // 2 slices (Day1 + Day2) → 1 divider shown (between Day1 and Day2)
    const draft2: DaySlice[] = [
      { dayId: DAY1_ID, dayNumber: 1, startIdx: 0, endIdx: 1, date: null },
      { dayId: DAY2_ID, dayNumber: 2, startIdx: 1, endIdx: 2, date: null },
    ]
    const ctx = makeCtx({ draftSlices: draft2 })
    renderWithCtx(ctx)
    expect(screen.getAllByTestId("boundary-drag-handle")).toHaveLength(1)
  })

  it("clicking Cancel calls setDraftSlices(null)", async () => {
    const setDraftSlices = vi.fn()
    const ctx = makeCtx({ draftSlices: draft, setDraftSlices })
    renderWithCtx(ctx)
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }))
    expect(setDraftSlices).toHaveBeenCalledWith(null)
  })

  it("clicking Apply dispatches BOUNDARIES_APPLY optimistically then calls applyBoundaries", async () => {
    const setDraftSlices = vi.fn()
    const dispatch = vi.fn()
    const ctx = makeCtx({ draftSlices: draft, setDraftSlices, dispatch })
    renderWithCtx(ctx)
    await userEvent.click(screen.getByRole("button", { name: /apply/i }))
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: "BOUNDARIES_APPLY" }))
    expect(actions.applyBoundaries).toHaveBeenCalledWith(ITIN_ID, expect.any(Object))
    expect(setDraftSlices).toHaveBeenCalledWith(null)
  })

  it("on success dispatches STATE_REPLACE with server state", async () => {
    const dispatch = vi.fn()
    const ctx = makeCtx({ draftSlices: draft, dispatch })
    renderWithCtx(ctx)
    await userEvent.click(screen.getByRole("button", { name: /apply/i }))
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: "STATE_REPLACE" }))
  })

  it("on failure dispatches STATE_REPLACE with snapshot to rollback", async () => {
    vi.mocked(actions.applyBoundaries).mockResolvedValueOnce({
      success: false,
      error: "Server error",
    })
    const dispatch = vi.fn()
    const ctx = makeCtx({ draftSlices: draft, dispatch })
    renderWithCtx(ctx)
    await userEvent.click(screen.getByRole("button", { name: /apply/i }))
    const stateReplaceCalls = dispatch.mock.calls
      .map((c) => c[0])
      .filter((a) => a.type === "STATE_REPLACE")
    expect(stateReplaceCalls).toHaveLength(1)
    expect(stateReplaceCalls[0].state).toMatchObject({
      points: ctx.state.points,
      pointOrder: ctx.state.pointOrder,
    })
  })
})

// ─── type change in boundary-edit mode ───────────────────────────────────────

describe("PointListPane — type change in boundary-edit mode", () => {
  const draft: DaySlice[] = [{ dayId: DAY1_ID, dayNumber: 1, startIdx: 0, endIdx: 2, date: null }]

  it("type buttons reflect dirty selection immediately without dispatching POINT_UPDATE", async () => {
    const dispatch = vi.fn()
    const ctx = makeCtx({ draftSlices: draft, activePointId: "p1", dispatch })
    renderWithCtx(ctx)

    await userEvent.click(screen.getByRole("button", { name: /^stop$/i }))

    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: "POINT_UPDATE" }))
    expect(screen.getByRole("button", { name: /^stop$/i })).toHaveClass("bg-primary")
  })

  it("dirty type is included in apply payload on Apply click", async () => {
    const ctx = makeCtx({ draftSlices: draft, activePointId: "p1" })
    renderWithCtx(ctx)

    await userEvent.click(screen.getByRole("button", { name: /^stop$/i }))
    await userEvent.click(screen.getByRole("button", { name: /apply/i }))

    expect(actions.applyBoundaries).toHaveBeenCalledWith(
      ITIN_ID,
      expect.objectContaining({
        points: expect.arrayContaining([expect.objectContaining({ id: "p1", type: "stop" })]),
      }),
    )
  })
})

// ─── delete day ───────────────────────────────────────────────────────────────

describe("PointListPane — delete day", () => {
  const stateWithDay = {
    points: [pt("p1", DAY1_ID), pt("p2", DAY1_ID), pt("p3", DAY1_ID)],
    pointOrder: ["p1", "p2", "p3"],
    pendingPointId: null,
    pendingPointName: null,
    savingCount: 0,
    days: [day(DAY1_ID, 1, { startPointId: "p1", endPointId: "p3" })],
  }

  it("shows a delete button for the last day in normal mode", () => {
    renderWithCtx(makeCtx({ state: stateWithDay }))
    expect(screen.getByRole("button", { name: /delete day 1/i })).toBeInTheDocument()
  })

  it("does not show delete button when there are no days", () => {
    renderWithCtx(makeCtx())
    expect(screen.queryByRole("button", { name: /delete day/i })).not.toBeInTheDocument()
  })

  it("does not show delete button in boundary-edit mode", () => {
    const draft: DaySlice[] = [{ dayId: DAY1_ID, dayNumber: 1, startIdx: 0, endIdx: 2, date: null }]
    renderWithCtx(makeCtx({ draftSlices: draft, state: stateWithDay }))
    expect(screen.queryByRole("button", { name: /delete day/i })).not.toBeInTheDocument()
  })

  it("clicking delete dispatches DAY_REMOVE and calls deleteDay", async () => {
    const dispatch = vi.fn()
    renderWithCtx(makeCtx({ dispatch, state: stateWithDay }))
    await userEvent.click(screen.getByRole("button", { name: /delete day 1/i }))
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: "DAY_REMOVE", id: DAY1_ID }),
    )
    expect(actions.deleteDay).toHaveBeenCalledWith(DAY1_ID)
  })

  it("delete button targets the highest-numbered day when multiple days exist", () => {
    const state = {
      ...stateWithDay,
      days: [day(DAY1_ID, 1, { endPointId: "p1" }), day(DAY2_ID, 2, { endPointId: "p3" })],
    }
    renderWithCtx(makeCtx({ state }))
    expect(screen.getByRole("button", { name: /delete day 2/i })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /delete day 1/i })).not.toBeInTheDocument()
  })
})

// ─── Day 1 header ─────────────────────────────────────────────────────────────

describe("PointListPane — Day 1 header in boundary-edit mode", () => {
  it("shows a Day 1 section header when in boundary-edit mode", () => {
    const draft: DaySlice[] = [
      { dayId: DAY1_ID, dayNumber: 1, startIdx: 0, endIdx: 1, date: "2026-07-01" },
      { dayId: DAY2_ID, dayNumber: 2, startIdx: 1, endIdx: 2, date: null },
    ]
    renderWithCtx(makeCtx({ draftSlices: draft }))
    expect(screen.getByTestId("day-1-header")).toBeInTheDocument()
  })

  it("shows Day 1 header with a date input pre-filled from the slice", () => {
    const draft: DaySlice[] = [
      { dayId: DAY1_ID, dayNumber: 1, startIdx: 0, endIdx: 1, date: "2026-07-01" },
      { dayId: DAY2_ID, dayNumber: 2, startIdx: 1, endIdx: 2, date: null },
    ]
    renderWithCtx(makeCtx({ draftSlices: draft }))
    expect(screen.getByDisplayValue("2026-07-01")).toBeInTheDocument()
  })
})

// ─── Edit boundaries ──────────────────────────────────────────────────────────

describe("PointListPane — Edit boundaries", () => {
  it("clicking 'Edit boundaries' calls setDraftSlices with initDaySlices result", async () => {
    const setDraftSlices = vi.fn()
    const ctx = makeCtx({
      setDraftSlices,
      state: {
        points: [pt("p1", DAY1_ID)],
        pointOrder: ["p1"],
        pendingPointId: null,
        pendingPointName: null,
        savingCount: 0,
        days: [day(DAY1_ID, 1, { startPointId: "p1" })],
      },
    })
    renderWithCtx(ctx)
    await userEvent.click(screen.getByRole("button", { name: /edit boundaries/i }))
    expect(boundaries.initDaySlices).toHaveBeenCalled()
    expect(setDraftSlices).toHaveBeenCalledWith(expect.any(Array))
  })
})
