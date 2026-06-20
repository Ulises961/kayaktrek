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
    pt("p3", { type: "position", name: "Cave" }),
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
    tripName: "Test Trip",
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
    selectedHour: 12,
    setSelectedHour: vi.fn(),
    conditionsVersion: 0,
    bumpConditions: vi.fn(),
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
  it("renders nothing when no point is selected", () => {
    const { container } = renderWithCtx(makeCtx({ selectedPointId: null }))
    expect(container.firstChild).toBeNull()
  })

  it("renders the sheet when a point is selected", () => {
    renderWithCtx(makeCtx())
    expect(screen.getByTestId("point-detail-sheet")).toBeInTheDocument()
    expect(screen.getByText("Harbour")).toBeInTheDocument()
  })
})

describe("PointDetailSheet — content", () => {
  it("shows the point name", () => {
    renderWithCtx(makeCtx())
    expect(screen.getByText("Harbour")).toBeInTheDocument()
  })

  it("shows the point type for a waypoint", () => {
    renderWithCtx(makeCtx({ selectedPointId: "p3" }))
    expect(screen.getByText("position")).toBeInTheDocument()
  })

  it("shows Leg, Notes and Images tiles", () => {
    renderWithCtx(makeCtx())
    // p1 is the day's first point — no inbound leg, so the tile reads "Leg" / "Start".
    expect(screen.getByText("Leg")).toBeInTheDocument()
    expect(screen.getByText("Start")).toBeInTheDocument()
    expect(screen.getByTestId("point-notes-tile")).toBeInTheDocument()
    expect(screen.getByTestId("point-images-tile")).toBeInTheDocument()
  })

  it("labels the leg tile with the planning speed for a point with an inbound leg", () => {
    // p2 follows p1 on the same day, so its tile shows the ETA at the avg speed.
    renderWithCtx(makeCtx({ selectedPointId: "p2" }))
    expect(screen.getByText("Avg speed 2.5 kn")).toBeInTheDocument()
  })

  it("shows a notes preview when notes are present", () => {
    renderWithCtx(makeCtx())
    expect(screen.getByText("Tricky entrance at low tide")).toBeInTheDocument()
  })

  it("shows an 'Add…' notes affordance when editable and no notes", () => {
    renderWithCtx(makeCtx({ selectedPointId: "p2" }))
    expect(screen.getByText("Add…")).toBeInTheDocument()
  })
})

describe("PointDetailSheet — detail modal", () => {
  it("opens the detail modal with an editable notes field when the Notes tile is clicked", async () => {
    renderWithCtx(makeCtx())
    await userEvent.click(screen.getByTestId("point-notes-tile"))
    expect(screen.getByRole("textbox")).toBeInTheDocument()
  })

  it("opens the detail modal showing coordinates when the Images tile is clicked", async () => {
    renderWithCtx(makeCtx())
    await userEvent.click(screen.getByTestId("point-images-tile"))
    expect(screen.getByText(/43\.123°N · 14\.568°E/)).toBeInTheDocument()
  })
})

describe("PointDetailSheet — close", () => {
  it("calls setSelectedPointId(null) when the close button is clicked", async () => {
    const setSelectedPointId = vi.fn()
    renderWithCtx(makeCtx({ setSelectedPointId }))
    await userEvent.click(screen.getByRole("button", { name: /close/i }))
    expect(setSelectedPointId).toHaveBeenCalledWith(null)
  })
})
