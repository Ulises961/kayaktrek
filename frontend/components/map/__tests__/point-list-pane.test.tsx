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
    tripName: "Test Trip",
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
    conditionsVersion: 0,
    bumpConditions: vi.fn(),
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

  it("shows a Saved status after blur-saving the expanded row's name", async () => {
    const ctx = makeCtx({ activePointId: "p1" })
    renderWithCtx(ctx)
    const nameInput = screen.getByPlaceholderText("Point name")
    await userEvent.clear(nameInput)
    await userEvent.type(nameInput, "New name")
    await userEvent.tab()
    expect(actions.updatePoint).toHaveBeenCalledWith("p1", { name: "New name" })
    expect(await screen.findByText(/saved/i)).toBeInTheDocument()
  })

  it("does not show a save status while in boundary-edit (draft) mode", () => {
    const draft: DaySlice[] = [{ dayId: DAY1_ID, dayNumber: 1, startIdx: 0, endIdx: 2, date: null }]
    const ctx = makeCtx({ draftSlices: draft, activePointId: "p1" })
    renderWithCtx(ctx)
    expect(screen.queryByText(/saving|saved/i)).not.toBeInTheDocument()
  })

  it("shows 'Edit days' button when days exist", () => {
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
    expect(screen.getByRole("button", { name: /edit days/i })).toBeInTheDocument()
  })

  it("shows 'Edit days' button even when there are no days yet", () => {
    renderWithCtx(makeCtx())
    expect(screen.getByRole("button", { name: /edit days/i })).toBeInTheDocument()
  })

  it("does not show 'Add day' button in view mode", () => {
    renderWithCtx(makeCtx())
    expect(screen.queryByRole("button", { name: /add day/i })).not.toBeInTheDocument()
  })

  it("does not show 'Save days' or 'Discard' in drop mode", () => {
    renderWithCtx(makeCtx())
    expect(screen.queryByRole("button", { name: /save days/i })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /discard/i })).not.toBeInTheDocument()
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

// ─── view mode — confirmed boundaries always visible ─────────────────────────

describe("PointListPane — view mode boundaries", () => {
  const stateWithDays = {
    points: [pt("p1", DAY1_ID), pt("p2", DAY1_ID), pt("p3", DAY2_ID)],
    pointOrder: ["p1", "p2", "p3"],
    pendingPointId: null,
    pendingPointName: null,
    savingCount: 0,
    days: [
      day(DAY1_ID, 1, { startPointId: "p1", endPointId: "p2" }),
      day(DAY2_ID, 2, { startPointId: "p2", endPointId: "p3" }),
    ],
  }

  it("shows Day 1 header when days exist and draftSlices is null", () => {
    const ctx = makeCtx({ state: stateWithDays })
    renderWithCtx(ctx)
    expect(screen.getByTestId("day-1-header")).toBeInTheDocument()
  })

  it("shows a non-interactive boundary label between days in view mode", () => {
    const ctx = makeCtx({ state: stateWithDays })
    renderWithCtx(ctx)
    expect(screen.getByTestId("boundary-label")).toBeInTheDocument()
    expect(screen.queryByTestId("boundary-drag-handle")).not.toBeInTheDocument()
  })

  it("does not show a boundary label when there are no days", () => {
    const ctx = makeCtx()
    renderWithCtx(ctx)
    expect(screen.queryByTestId("boundary-label")).not.toBeInTheDocument()
    expect(screen.queryByTestId("day-1-header")).not.toBeInTheDocument()
  })
})

// ─── boundary-edit mode ───────────────────────────────────────────────────────

describe("PointListPane — boundary-edit mode (draftSlices non-null)", () => {
  const draft: DaySlice[] = [{ dayId: DAY1_ID, dayNumber: 1, startIdx: 0, endIdx: 1, date: null }]

  it("shows 'Save days' and 'Discard' buttons when draftSlices is non-null", () => {
    const ctx = makeCtx({ draftSlices: draft })
    renderWithCtx(ctx)
    expect(screen.getByRole("button", { name: /save days/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /discard/i })).toBeInTheDocument()
  })

  it("shows 'Add day' and does not show 'Edit days' in boundary-edit mode", () => {
    const ctx = makeCtx({ draftSlices: draft })
    renderWithCtx(ctx)
    expect(screen.getByRole("button", { name: /add day/i })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /edit days/i })).not.toBeInTheDocument()
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

  it("clicking Discard calls setDraftSlices(null)", async () => {
    const setDraftSlices = vi.fn()
    const ctx = makeCtx({ draftSlices: draft, setDraftSlices })
    renderWithCtx(ctx)
    await userEvent.click(screen.getByRole("button", { name: /discard/i }))
    expect(setDraftSlices).toHaveBeenCalledWith(null)
  })

  it("clicking Save days dispatches BOUNDARIES_APPLY optimistically then calls applyBoundaries", async () => {
    const setDraftSlices = vi.fn()
    const dispatch = vi.fn()
    const ctx = makeCtx({ draftSlices: draft, setDraftSlices, dispatch })
    renderWithCtx(ctx)
    await userEvent.click(screen.getByRole("button", { name: /save days/i }))
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: "BOUNDARIES_APPLY" }))
    expect(actions.applyBoundaries).toHaveBeenCalledWith(ITIN_ID, expect.any(Object))
    expect(setDraftSlices).toHaveBeenCalledWith(null)
  })

  it("on success dispatches STATE_REPLACE with server state", async () => {
    const dispatch = vi.fn()
    const ctx = makeCtx({ draftSlices: draft, dispatch })
    renderWithCtx(ctx)
    await userEvent.click(screen.getByRole("button", { name: /save days/i }))
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
    await userEvent.click(screen.getByRole("button", { name: /save days/i }))
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

// ─── deferred day creation (draft-only days) ─────────────────────────────────

describe("PointListPane — deferred day creation", () => {
  it("Save days creates a real Day for a draft slice before applying boundaries", async () => {
    const draftWithNewDay: DaySlice[] = [
      { dayId: "draft-1", dayNumber: 1, startIdx: 0, endIdx: 2, date: null },
    ]
    renderWithCtx(makeCtx({ draftSlices: draftWithNewDay }))
    await userEvent.click(screen.getByRole("button", { name: /save days/i }))
    expect(actions.createDay).toHaveBeenCalledWith(ITIN_ID, 1)
    expect(actions.applyBoundaries).toHaveBeenCalledWith(
      ITIN_ID,
      expect.objectContaining({
        boundaries: expect.arrayContaining([expect.objectContaining({ dayId: "new-day" })]),
      }),
    )
  })

  it("resolves multiple draft slices in order before applying boundaries", async () => {
    const draftWithTwoNewDays: DaySlice[] = [
      { dayId: "draft-1", dayNumber: 1, startIdx: 0, endIdx: 1, date: null },
      { dayId: "draft-2", dayNumber: 2, startIdx: 1, endIdx: 2, date: null },
    ]
    vi.mocked(actions.createDay)
      .mockResolvedValueOnce({
        success: true,
        day: { id: "day-a", dayNumber: 1, itineraryId: ITIN_ID },
      })
      .mockResolvedValueOnce({
        success: true,
        day: { id: "day-b", dayNumber: 2, itineraryId: ITIN_ID },
      })
    renderWithCtx(makeCtx({ draftSlices: draftWithTwoNewDays }))
    await userEvent.click(screen.getByRole("button", { name: /save days/i }))
    expect(actions.createDay).toHaveBeenNthCalledWith(1, ITIN_ID, 1)
    expect(actions.createDay).toHaveBeenNthCalledWith(2, ITIN_ID, 2)
    expect(actions.applyBoundaries).toHaveBeenCalledWith(
      ITIN_ID,
      expect.objectContaining({
        boundaries: [
          expect.objectContaining({ dayId: "day-a" }),
          expect.objectContaining({ dayId: "day-b" }),
        ],
      }),
    )
  })

  it("does not call createDay for slices with a real (non-draft) dayId", async () => {
    const draftAllReal: DaySlice[] = [
      { dayId: DAY1_ID, dayNumber: 1, startIdx: 0, endIdx: 2, date: null },
    ]
    renderWithCtx(makeCtx({ draftSlices: draftAllReal }))
    await userEvent.click(screen.getByRole("button", { name: /save days/i }))
    expect(actions.createDay).not.toHaveBeenCalled()
  })

  it("rolls back earlier-created days and aborts the save if a later createDay fails", async () => {
    const draftWithTwoNewDays: DaySlice[] = [
      { dayId: "draft-1", dayNumber: 1, startIdx: 0, endIdx: 1, date: null },
      { dayId: "draft-2", dayNumber: 2, startIdx: 1, endIdx: 2, date: null },
    ]
    vi.mocked(actions.createDay)
      .mockResolvedValueOnce({
        success: true,
        day: { id: "day-a", dayNumber: 1, itineraryId: ITIN_ID },
      })
      .mockResolvedValueOnce({ success: false, error: "Server error" })
    renderWithCtx(makeCtx({ draftSlices: draftWithTwoNewDays }))
    await userEvent.click(screen.getByRole("button", { name: /save days/i }))
    expect(actions.deleteDay).toHaveBeenCalledWith("day-a")
    expect(actions.applyBoundaries).not.toHaveBeenCalled()
  })

  it("Discard never calls createDay or deleteDay for draft-only days", async () => {
    const draftWithNewDay: DaySlice[] = [
      { dayId: "draft-1", dayNumber: 1, startIdx: 0, endIdx: 2, date: null },
    ]
    renderWithCtx(makeCtx({ draftSlices: draftWithNewDay }))
    await userEvent.click(screen.getByRole("button", { name: /discard/i }))
    expect(actions.createDay).not.toHaveBeenCalled()
    expect(actions.deleteDay).not.toHaveBeenCalled()
  })

  it("deleting a draft day via its boundary divider drops it locally without calling deleteDay", async () => {
    const setDraftSlices = vi.fn()
    const draftWithNewDay: DaySlice[] = [
      { dayId: DAY1_ID, dayNumber: 1, startIdx: 0, endIdx: 1, date: null },
      { dayId: "draft-2", dayNumber: 2, startIdx: 1, endIdx: 2, date: null },
    ]
    const dispatch = vi.fn()
    renderWithCtx(
      makeCtx({
        draftSlices: draftWithNewDay,
        setDraftSlices,
        dispatch,
        state: {
          points: [pt("p1", DAY1_ID), pt("p2", DAY1_ID), pt("p3", "draft-2")],
          pointOrder: ["p1", "p2", "p3"],
          pendingPointId: null,
          pendingPointName: null,
          savingCount: 0,
          days: [day(DAY1_ID, 1, { startPointId: "p1", endPointId: "p2" })],
        },
      }),
    )
    await userEvent.click(screen.getByRole("button", { name: /delete day 2/i }))
    expect(actions.deleteDay).not.toHaveBeenCalled()
    expect(dispatch).not.toHaveBeenCalledWith(expect.objectContaining({ type: "DAY_REMOVE" }))
    expect(setDraftSlices).toHaveBeenCalledWith([
      expect.objectContaining({ dayId: DAY1_ID, endIdx: 2 }),
    ])
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

  it("dirty type is included in apply payload on Save days click", async () => {
    const ctx = makeCtx({ draftSlices: draft, activePointId: "p1" })
    renderWithCtx(ctx)

    await userEvent.click(screen.getByRole("button", { name: /^stop$/i }))
    await userEvent.click(screen.getByRole("button", { name: /save days/i }))

    expect(actions.applyBoundaries).toHaveBeenCalledWith(
      ITIN_ID,
      expect.objectContaining({
        points: expect.arrayContaining([expect.objectContaining({ id: "p1", type: "stop" })]),
      }),
    )
  })
})

// ─── delete day via boundary divider ─────────────────────────────────────────

describe("PointListPane — delete day via boundary divider", () => {
  const stateWithDays = {
    points: [pt("p1", DAY1_ID), pt("p2", DAY2_ID)],
    pointOrder: ["p1", "p2"],
    pendingPointId: null,
    pendingPointName: null,
    savingCount: 0,
    days: [
      day(DAY1_ID, 1, { startPointId: "p1", endPointId: "p1" }),
      day(DAY2_ID, 2, { startPointId: "p1", endPointId: "p2" }),
    ],
  }

  const draft: DaySlice[] = [
    { dayId: DAY1_ID, dayNumber: 1, startIdx: 0, endIdx: 0, date: null },
    { dayId: DAY2_ID, dayNumber: 2, startIdx: 0, endIdx: 1, date: null },
  ]

  it("does not show a delete day button in the header in view mode", () => {
    renderWithCtx(makeCtx({ state: stateWithDays }))
    expect(screen.queryByRole("button", { name: /delete day/i })).not.toBeInTheDocument()
  })

  it("does not show a delete button when there are no days", () => {
    renderWithCtx(makeCtx())
    expect(screen.queryByRole("button", { name: /delete day/i })).not.toBeInTheDocument()
  })

  it("shows a delete button on the interactive boundary divider in edit mode", () => {
    renderWithCtx(makeCtx({ state: stateWithDays, draftSlices: draft }))
    expect(screen.getByRole("button", { name: /delete day 2/i })).toBeInTheDocument()
  })

  it("clicking divider delete dispatches DAY_REMOVE and calls deleteDay", async () => {
    const dispatch = vi.fn()
    renderWithCtx(makeCtx({ dispatch, state: stateWithDays, draftSlices: draft }))
    await userEvent.click(screen.getByRole("button", { name: /delete day 2/i }))
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: "DAY_REMOVE", id: DAY2_ID }),
    )
    expect(actions.deleteDay).toHaveBeenCalledWith(DAY2_ID)
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

  it("shows Day 1 header with the date picker pre-filled from the slice", () => {
    const draft: DaySlice[] = [
      { dayId: DAY1_ID, dayNumber: 1, startIdx: 0, endIdx: 1, date: "2026-07-01" },
      { dayId: DAY2_ID, dayNumber: 2, startIdx: 1, endIdx: 2, date: null },
    ]
    renderWithCtx(makeCtx({ draftSlices: draft }))
    expect(screen.getByText("1 Jul 2026")).toBeInTheDocument()
  })
})

// ─── Edit days ────────────────────────────────────────────────────────────────

describe("PointListPane — Edit days", () => {
  it("clicking 'Edit days' calls setDraftSlices with initDaySlices result", async () => {
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
    await userEvent.click(screen.getByRole("button", { name: /edit days/i }))
    expect(boundaries.initDaySlices).toHaveBeenCalled()
    expect(setDraftSlices).toHaveBeenCalledWith(expect.any(Array))
  })

  it("clicking 'Edit days' with zero existing days enters draft mode with an empty slice list", async () => {
    const setDraftSlices = vi.fn()
    const ctx = makeCtx({ setDraftSlices })
    renderWithCtx(ctx)
    await userEvent.click(screen.getByRole("button", { name: /edit days/i }))
    expect(setDraftSlices).toHaveBeenCalledWith([])
  })
})

// ─── add day §2: midpoint placement ──────────────────────────────────────────

describe("PointListPane — add day: midpoint placement", () => {
  it("no days yet in the draft: new day slice covers all points (indices 0 to M-1)", async () => {
    const setDraftSlices = vi.fn()
    // Already in draft mode (draftSlices: []) — "Add day" only ever shows there.
    renderWithCtx(makeCtx({ draftSlices: [], setDraftSlices }))
    await userEvent.click(screen.getByRole("button", { name: /add day/i }))
    expect(setDraftSlices).toHaveBeenCalledWith([
      expect.objectContaining({ startIdx: 0, endIdx: 2, dayNumber: 1, dayId: "draft-1" }),
    ])
  })

  it("places new boundary at midpoint of the last draft slice's range", async () => {
    const setDraftSlices = vi.fn()
    const state4pts = {
      points: [pt("p1", DAY1_ID), pt("p2", DAY1_ID), pt("p3", DAY1_ID), pt("p4", DAY1_ID)],
      pointOrder: ["p1", "p2", "p3", "p4"],
      pendingPointId: null,
      pendingPointName: null,
      savingCount: 0,
      days: [day(DAY1_ID, 1, { startPointId: "p1", endPointId: "p4" })],
    }
    const draft: DaySlice[] = [{ dayId: DAY1_ID, dayNumber: 1, startIdx: 0, endIdx: 3, date: null }]
    renderWithCtx(makeCtx({ state: state4pts, draftSlices: draft, setDraftSlices }))
    await userEvent.click(screen.getByRole("button", { name: /add day/i }))
    // midIdx = floor((0+3)/2) = 1
    expect(setDraftSlices).toHaveBeenCalledWith([
      { dayId: DAY1_ID, dayNumber: 1, startIdx: 0, endIdx: 1, date: null },
      expect.objectContaining({ startIdx: 1, endIdx: 3, dayNumber: 2, dayId: "draft-2" }),
    ])
  })

  it("1-point last day: midIdx equals startIdx (new day shares the boundary point)", async () => {
    const setDraftSlices = vi.fn()
    const state1pt = {
      points: [pt("p1", DAY1_ID)],
      pointOrder: ["p1"],
      pendingPointId: null,
      pendingPointName: null,
      savingCount: 0,
      days: [day(DAY1_ID, 1, { startPointId: "p1", endPointId: "p1" })],
    }
    const draft: DaySlice[] = [{ dayId: DAY1_ID, dayNumber: 1, startIdx: 0, endIdx: 0, date: null }]
    renderWithCtx(makeCtx({ state: state1pt, draftSlices: draft, setDraftSlices }))
    await userEvent.click(screen.getByRole("button", { name: /add day/i }))
    // midIdx = floor((0+0)/2) = 0
    expect(setDraftSlices).toHaveBeenCalledWith([
      { dayId: DAY1_ID, dayNumber: 1, startIdx: 0, endIdx: 0, date: null },
      expect.objectContaining({ startIdx: 0, endIdx: 0, dayNumber: 2 }),
    ])
  })
})
