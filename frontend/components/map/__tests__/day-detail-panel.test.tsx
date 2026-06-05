import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createElement } from "react"
import { MapBuilderContext } from "@/lib/itinerary/map-builder-context"
import type { MapBuilderContextValue } from "@/lib/itinerary/map-builder-context"
import type { MapState } from "@/lib/itinerary/map-reducer"
import type { Point } from "@/lib/dtos/point"
import type { Day } from "@/lib/dtos/day"

const { mockUpdatePoint } = vi.hoisted(() => ({
  mockUpdatePoint: vi.fn().mockResolvedValue({ success: true }),
}))

vi.mock("@/lib/itinerary/actions", () => ({
  updatePoint: mockUpdatePoint,
}))

import { DayDetailPanel } from "../day-detail-panel"

const DAY1_ID = "day-1"
const ITIN_ID = "itin-1"

const pt = (id: string, name?: string): Point => ({
  id, type: "position", latitude: 44, longitude: 14, dayId: DAY1_ID, name: name ?? undefined,
})

const day1: Day = { id: DAY1_ID, dayNumber: 1, itineraryId: ITIN_ID }

function makeCtx(overrides: Partial<MapBuilderContextValue> = {}): MapBuilderContextValue {
  const state: MapState = {
    points: [pt("p1", "Harbour"), pt("p2", "Cala Bianca"), pt("p3")],
    pointOrder: ["p1", "p2", "p3"],
    pendingPointId: null,
    pendingPointName: null,
    savingCount: 0,
    days: [day1],
    ...(overrides.state as Partial<MapState>),
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
    day0Id: "day-0",
    viewMode: true,
    setViewMode: vi.fn(),
    selectedDayId: DAY1_ID,
    setSelectedDayId: vi.fn(),
    tripState: null,
    isLeader: true,
    ...overrides,
  }
}

function renderWithCtx(ctx: MapBuilderContextValue) {
  return render(createElement(MapBuilderContext.Provider, { value: ctx }, createElement(DayDetailPanel)))
}

beforeEach(() => vi.clearAllMocks())

describe("DayDetailPanel — visibility", () => {
  it("renders nothing when selectedDayId is null", () => {
    renderWithCtx(makeCtx({ selectedDayId: null }))
    expect(screen.queryByRole("list")).not.toBeInTheDocument()
  })

  it("renders the panel when selectedDayId is set", () => {
    renderWithCtx(makeCtx())
    expect(screen.getByRole("list")).toBeInTheDocument()
  })
})

describe("DayDetailPanel — point list", () => {
  it("renders points for the selected day in route order", () => {
    renderWithCtx(makeCtx())
    const items = screen.getAllByRole("listitem")
    expect(items).toHaveLength(3)
  })

  it("shows named points by their name (crew — read-only spans)", () => {
    renderWithCtx(makeCtx({ isLeader: false }))
    expect(screen.getByText("Harbour")).toBeInTheDocument()
    expect(screen.getByText("Cala Bianca")).toBeInTheDocument()
  })

  it("shows named points by their name (leader — editable inputs)", () => {
    renderWithCtx(makeCtx({ isLeader: true }))
    expect(screen.getByDisplayValue("Harbour")).toBeInTheDocument()
    expect(screen.getByDisplayValue("Cala Bianca")).toBeInTheDocument()
  })

  it("shows the 1-based index for unnamed points", () => {
    renderWithCtx(makeCtx())
    // p3 has no name, is at index 3 in pointOrder
    expect(screen.getByText("3")).toBeInTheDocument()
  })
})

describe("DayDetailPanel — leader vs crew", () => {
  it("renders an editable name input for leaders", () => {
    renderWithCtx(makeCtx({ isLeader: true }))
    expect(screen.getAllByRole("textbox")).not.toHaveLength(0)
  })

  it("renders no editable inputs for crew", () => {
    renderWithCtx(makeCtx({ isLeader: false }))
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument()
  })

  it("calls updatePoint on blur when leader edits a name", async () => {
    renderWithCtx(makeCtx({ isLeader: true }))
    const inputs = screen.getAllByRole("textbox")
    await userEvent.clear(inputs[0])
    await userEvent.type(inputs[0], "New Harbour")
    await userEvent.tab()
    expect(mockUpdatePoint).toHaveBeenCalledWith("p1", expect.objectContaining({ name: "New Harbour" }))
  })
})
