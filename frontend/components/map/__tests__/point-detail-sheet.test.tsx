import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createElement } from "react"
import { MapBuilderContext } from "@/lib/itinerary/map-builder-context"
import type { MapBuilderContextValue } from "@/lib/itinerary/map-builder-context"
import type { MapState } from "@/lib/itinerary/map-reducer"
import type { Point } from "@/lib/dtos/point"

import { PointDetailSheet } from "../point-detail-sheet"
import { haversineNm, legLabel, formatDistance } from "@/lib/itinerary/distance"

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
    draft: null,
    setDraft: vi.fn(),
    removedRealDayIds: [],
    setRemovedRealDayIds: vi.fn(),
    tripId: null,
    tripName: "Test Trip",
    tripDateFrom: null,
    tripDateTo: null,
    itineraryId: ITIN_ID,
    distanceUnit: "nm",
    setDistanceUnit: vi.fn(),
    avgSpeedKnots: 2.5,
    setAvgSpeedKnots: vi.fn(),
    day0Id: "day-0",
    resolveDay0Id: vi.fn(async () => "day-0"),
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

describe("PointDetailSheet — the first point of a day", () => {
  // The overnight stop belongs to the day that *ends* there, so day 2's own points
  // begin after it. Grouping by dayId alone made day 2's first point look like a
  // fresh start, and the crossing from the stop was reported by nothing at all —
  // the tile read "Start" on a point you had paddled to.
  const DAY2_ID = "day-2"
  const overnight = pt("p2", { type: "stop", latitude: 43.5, longitude: 14.5678 })
  const dayTwoFirst = pt("p3", { type: "position", latitude: 44.0, dayId: DAY2_ID })

  const twoDayCtx = (overrides: Partial<MapBuilderContextValue> = {}) =>
    makeCtx({
      state: {
        points: [
          pt("p1", { type: "stop", latitude: 43.0, longitude: 14.5678 }),
          overnight,
          dayTwoFirst,
        ],
        pointOrder: ["p1", "p2", "p3"],
        pendingPointId: null,
        pendingPointName: null,
        savingCount: 0,
        days: [],
      },
      selectedDayId: DAY2_ID,
      ...overrides,
    })

  it("reports the crossing from the previous day's overnight stop", () => {
    renderWithCtx(twoDayCtx({ selectedPointId: "p3" }))

    const crossing = haversineNm(
      { latitude: 43.5, longitude: 14.5678 },
      { latitude: 44.0, longitude: 14.5678 },
    )
    expect(screen.getByText(legLabel(crossing, 2.5, "nm"))).toBeInTheDocument()
    expect(screen.queryByText("Start")).not.toBeInTheDocument()
  })

  it("counts the day's total from that stop, matching the day's own distance", () => {
    // The boundary divider has always totalled a day *including* the crossing leg
    // (getSliceDistance starts at the shared stop). The per-point running total
    // used to start one point later, so the two disagreed by exactly this leg.
    renderWithCtx(twoDayCtx({ selectedPointId: "p3" }))

    const crossing = haversineNm(
      { latitude: 43.5, longitude: 14.5678 },
      { latitude: 44.0, longitude: 14.5678 },
    )
    expect(screen.getByText(`${formatDistance(crossing, "nm")} nm total`)).toBeInTheDocument()
  })

  it("still reads Start for the point that opens the whole route", () => {
    renderWithCtx(twoDayCtx({ selectedPointId: "p1", selectedDayId: DAY1_ID }))
    expect(screen.getByText("Start")).toBeInTheDocument()
  })
})

describe("PointDetailSheet — detail modal", () => {
  it("opens the detail modal (editable) when clicking anywhere on the sheet", async () => {
    renderWithCtx(makeCtx())
    await userEvent.click(screen.getByTestId("point-detail-sheet"))
    expect(screen.getByPlaceholderText(/landing notes/i)).toBeInTheDocument()
  })

  it("opens a read-only detail modal when clicking the sheet while not editable", async () => {
    renderWithCtx(makeCtx({ isLeader: false }))
    await userEvent.click(screen.getByTestId("point-detail-sheet"))
    expect(screen.queryByPlaceholderText(/landing notes/i)).not.toBeInTheDocument()
    expect(screen.getByText(/43\.123°N · 14\.568°E/)).toBeInTheDocument()
  })

  it("clicking a tile also opens the modal (tiles are part of the clickable sheet)", async () => {
    renderWithCtx(makeCtx())
    await userEvent.click(screen.getByTestId("point-notes-tile"))
    expect(screen.getByPlaceholderText(/landing notes/i)).toBeInTheDocument()
  })

  it("the Notes and Images tiles are presentational, not their own buttons", () => {
    renderWithCtx(makeCtx())
    expect(screen.getByTestId("point-notes-tile").tagName).not.toBe("BUTTON")
    expect(screen.getByTestId("point-images-tile").tagName).not.toBe("BUTTON")
  })
})

describe("PointDetailSheet — close", () => {
  it("calls setSelectedPointId(null) when the close button is clicked", async () => {
    const setSelectedPointId = vi.fn()
    renderWithCtx(makeCtx({ setSelectedPointId }))
    await userEvent.click(screen.getByRole("button", { name: /close/i }))
    expect(setSelectedPointId).toHaveBeenCalledWith(null)
  })

  it("clicking the close button does not also open the detail modal", async () => {
    renderWithCtx(makeCtx())
    await userEvent.click(screen.getByRole("button", { name: /close/i }))
    expect(screen.queryByPlaceholderText(/landing notes/i)).not.toBeInTheDocument()
  })
})
