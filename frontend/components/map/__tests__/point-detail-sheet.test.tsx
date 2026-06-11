import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createElement } from "react"
import { MapBuilderContext } from "@/lib/itinerary/map-builder-context"
import type { MapBuilderContextValue } from "@/lib/itinerary/map-builder-context"
import type { MapState } from "@/lib/itinerary/map-reducer"
import type { Point } from "@/lib/dtos/point"

import { PointDetailSheet } from "../point-detail-sheet"

const DAY1_ID = "day-1"
const ITIN_ID = "itin-1"

const pt = (id: string, overrides: Partial<Point> = {}): Point => ({
  id,
  type: "position",
  latitude: 43.1234,
  longitude: 14.5678,
  dayId: DAY1_ID,
  ...overrides,
})

function makeCtx(overrides: Partial<MapBuilderContextValue> = {}): MapBuilderContextValue {
  const points = [
    pt("p1", { name: "Harbour", notes: "Tricky entrance at low tide" }),
    pt("p2", { type: "stop" }),
    pt("p3", { type: "interest", name: "Cave" }),
  ]
  const state: MapState = {
    points,
    pointOrder: ["p1", "p2", "p3"],
    pendingPointId: null,
    pendingPointName: null,
    savingCount: 0,
    days: [],
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
    selectedPointId: "p1",
    setSelectedPointId: vi.fn(),
    tripState: null,
    isLeader: true,
    ...overrides,
  }
}

function renderWithCtx(ctx: MapBuilderContextValue) {
  return render(
    createElement(MapBuilderContext.Provider, { value: ctx }, createElement(PointDetailSheet)),
  )
}

beforeEach(() => vi.clearAllMocks())

describe("PointDetailSheet — visibility", () => {
  it("renders nothing when selectedPointId is null", () => {
    const { container } = renderWithCtx(makeCtx({ selectedPointId: null }))
    expect(container.firstChild).toBeNull()
  })

  it("renders the sheet when selectedPointId is set", () => {
    renderWithCtx(makeCtx())
    expect(screen.getByText("Harbour")).toBeInTheDocument()
  })
})

describe("PointDetailSheet — content", () => {
  it("shows the global index", () => {
    renderWithCtx(makeCtx())
    expect(screen.getByText("1")).toBeInTheDocument()
  })

  it("shows the point name", () => {
    renderWithCtx(makeCtx())
    expect(screen.getByText("Harbour")).toBeInTheDocument()
  })

  it("falls back to coordinates when point has no name", () => {
    renderWithCtx(makeCtx({ selectedPointId: "p2" }))
    expect(screen.getAllByText("43.12340, 14.56780").length).toBeGreaterThan(0)
  })

  it("shows notes when present", () => {
    renderWithCtx(makeCtx())
    expect(screen.getByText("Tricky entrance at low tide")).toBeInTheDocument()
  })

  it("shows empty state when no notes or photos (read-only view)", () => {
    renderWithCtx(makeCtx({ selectedPointId: "p2", isLeader: false }))
    expect(screen.getByText("No notes or photos for this point.")).toBeInTheDocument()
  })

  it("shows the type label for a stop", () => {
    renderWithCtx(makeCtx({ selectedPointId: "p2" }))
    expect(screen.getByText(/Overnight stop/)).toBeInTheDocument()
  })

  it("shows the type label for a waypoint", () => {
    renderWithCtx(makeCtx())
    expect(screen.getByText(/Waypoint/)).toBeInTheDocument()
  })

  it("shows the type label for a point of interest", () => {
    renderWithCtx(makeCtx({ selectedPointId: "p3" }))
    expect(screen.getByText(/Point of interest/)).toBeInTheDocument()
  })
})

describe("PointDetailSheet — close", () => {
  it("calls setSelectedPointId(null) when close button is clicked", async () => {
    const setSelectedPointId = vi.fn()
    renderWithCtx(makeCtx({ setSelectedPointId }))
    await userEvent.click(screen.getByRole("button", { name: /close/i }))
    expect(setSelectedPointId).toHaveBeenCalledWith(null)
  })

  it("calls setSelectedPointId(null) when the backdrop is clicked", async () => {
    const setSelectedPointId = vi.fn()
    const { container } = renderWithCtx(makeCtx({ setSelectedPointId }))
    // The backdrop is the outermost div (first child)
    await userEvent.click(container.firstChild as HTMLElement)
    expect(setSelectedPointId).toHaveBeenCalledWith(null)
  })
})
