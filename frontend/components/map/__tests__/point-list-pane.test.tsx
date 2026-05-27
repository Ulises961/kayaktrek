import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createElement } from "react"
import { MapBuilderContext } from "@/lib/itinerary/map-builder-context"
import type { MapBuilderContextValue } from "@/lib/itinerary/map-builder-context"
import type { MapState } from "@/lib/itinerary/map-reducer"
import type { DraftBoundary } from "@/lib/itinerary/boundaries"
import type { Point } from "@/lib/dtos/point"
import type { Day } from "@/lib/dtos/day"

vi.mock("@/lib/itinerary/actions", () => ({
  createDay: vi.fn().mockResolvedValue({ success: true, day: { id: "new-day", dayNumber: 1, itineraryId: "itin" } }),
  deleteDay: vi.fn().mockResolvedValue({ success: true }),
  updateDay: vi.fn().mockResolvedValue({ success: true }),
  updatePoint: vi.fn().mockResolvedValue({ success: true }),
  deletePoint: vi.fn().mockResolvedValue({ success: true }),
}))

vi.mock("@/lib/itinerary/boundaries", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/itinerary/boundaries")>()
  return {
    ...actual,
    initDraftBoundaries: vi.fn(actual.initDraftBoundaries),
    applyDraftToPreviewDays: vi.fn(actual.applyDraftToPreviewDays),
  }
})

import { PointListPane } from "../point-list-pane"
import * as boundaries from "@/lib/itinerary/boundaries"

const DAY0_ID = "day-0"
const DAY1_ID = "day-1"
const ITIN_ID = "itin-1"

const pt = (id: string, dayId = DAY0_ID): Point => ({
  id, type: "position", latitude: 44, longitude: 14, dayId,
})

const day = (id: string, dayNumber: number, extra: Partial<Day> = {}): Day => ({
  id, dayNumber, itineraryId: ITIN_ID, ...extra,
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
    draftBoundaries: null,
    setDraftBoundaries: vi.fn(),
    tripId: null,
    itineraryId: ITIN_ID,
    distanceUnit: "nm",
    setDistanceUnit: vi.fn(),
    avgSpeedKnots: 2.5,
    setAvgSpeedKnots: vi.fn(),
    activePointId: null,
    setActivePointId: vi.fn(),
    day0Id: DAY0_ID,
    ...overrides,
  }
}

function renderWithCtx(ctx: MapBuilderContextValue) {
  return render(
    createElement(MapBuilderContext.Provider, { value: ctx }, createElement(PointListPane))
  )
}

beforeEach(() => vi.clearAllMocks())

describe("PointListPane — drop mode (no draftBoundaries)", () => {
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
    const ctx = makeCtx({ state: { points: [pt("p1"), pt("p2"), pt("p3")], pointOrder: ["p1", "p2", "p3"], pendingPointId: "p2", pendingPointName: null, savingCount: 0, days: [] } })
    renderWithCtx(ctx)
    // The expanded row shows the type selector — presence of "Stop" chip confirms expansion
    expect(screen.getByRole("button", { name: /stop/i })).toBeInTheDocument()
  })
})

describe("PointListPane — boundary-edit mode (draftBoundaries non-null)", () => {
  const draft: DraftBoundary[] = [
    { dayId: DAY1_ID, dayNumber: 1, endPointIdx: 1, date: null },
  ]

  it("shows 'Apply' and 'Cancel' buttons when draftBoundaries is non-null", () => {
    const ctx = makeCtx({ draftBoundaries: draft })
    renderWithCtx(ctx)
    expect(screen.getByRole("button", { name: /apply/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument()
  })

  it("does not show 'Edit boundaries' or 'Add day' in boundary-edit mode", () => {
    const ctx = makeCtx({ draftBoundaries: draft })
    renderWithCtx(ctx)
    expect(screen.queryByRole("button", { name: /edit boundaries/i })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /add day/i })).not.toBeInTheDocument()
  })

  it("renders a BoundaryDivider for each draft entry", () => {
    const ctx = makeCtx({ draftBoundaries: draft })
    renderWithCtx(ctx)
    expect(screen.getAllByTestId("boundary-drag-handle")).toHaveLength(1)
  })

  it("clicking Cancel calls setDraftBoundaries(null)", async () => {
    const setDraftBoundaries = vi.fn()
    const ctx = makeCtx({ draftBoundaries: draft, setDraftBoundaries })
    renderWithCtx(ctx)
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }))
    expect(setDraftBoundaries).toHaveBeenCalledWith(null)
  })

  it("clicking Apply calls applyDraftToPreviewDays and then setDraftBoundaries(null)", async () => {
    const setDraftBoundaries = vi.fn()
    const dispatch = vi.fn()
    const ctx = makeCtx({ draftBoundaries: draft, setDraftBoundaries, dispatch })
    renderWithCtx(ctx)
    await userEvent.click(screen.getByRole("button", { name: /apply/i }))
    expect(boundaries.applyDraftToPreviewDays).toHaveBeenCalled()
    expect(setDraftBoundaries).toHaveBeenCalledWith(null)
  })
})

describe("PointListPane — Edit boundaries", () => {
  it("clicking 'Edit boundaries' calls setDraftBoundaries with initDraftBoundaries result", async () => {
    const setDraftBoundaries = vi.fn()
    const ctx = makeCtx({
      setDraftBoundaries,
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
    expect(boundaries.initDraftBoundaries).toHaveBeenCalled()
    expect(setDraftBoundaries).toHaveBeenCalledWith(expect.any(Array))
  })
})
