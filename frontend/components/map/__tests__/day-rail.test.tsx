import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createElement } from "react"
import { MapBuilderContext } from "@/lib/itinerary/map-builder-context"
import type { MapBuilderContextValue } from "@/lib/itinerary/map-builder-context"
import type { MapState } from "@/lib/itinerary/map-reducer"
import type { Day } from "@/lib/dtos/day"
import type { Point } from "@/lib/dtos/point"
import { getDayColor } from "@/lib/itinerary/colors"

vi.mock("@/lib/weather/actions", () => ({
  fetchDayWeather: vi.fn().mockResolvedValue({ success: false }),
  fetchDaySea: vi.fn().mockResolvedValue({ success: false }),
}))

import { DayRail } from "../day-rail"

const DAY1_ID = "day-1"
const DAY2_ID = "day-2"
const ITIN_ID = "itin-1"

const pt = (id: string, dayId: string): Point => ({
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
    points: [pt("p1", DAY1_ID), pt("p2", DAY1_ID), pt("p3", DAY2_ID)],
    pointOrder: ["p1", "p2", "p3"],
    pendingPointId: null,
    pendingPointName: null,
    savingCount: 0,
    days: [day(DAY1_ID, 1), day(DAY2_ID, 2)],
    ...(overrides.state as Partial<MapState>),
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
    day0Id: "day-0",
    viewMode: true,
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
  return render(createElement(MapBuilderContext.Provider, { value: ctx }, createElement(DayRail)))
}

beforeEach(() => vi.clearAllMocks())

// ─── entries ─────────────────────────────────────────────────────────────────

describe("DayRail — entries", () => {
  it("renders one entry per numbered day", () => {
    renderWithCtx(makeCtx())
    expect(screen.getAllByTestId("day-rail-entry")).toHaveLength(2)
  })

  it("shows the day number for each entry", () => {
    renderWithCtx(makeCtx())
    expect(screen.getByText("Day 1")).toBeInTheDocument()
    expect(screen.getByText("Day 2")).toBeInTheDocument()
  })

  it("shows a formatted 'd MMM yyyy' date when set", () => {
    renderWithCtx(
      makeCtx({
        state: {
          points: [pt("p1", DAY1_ID)],
          pointOrder: ["p1"],
          pendingPointId: null,
          pendingPointName: null,
          savingCount: 0,
          days: [day(DAY1_ID, 1, { date: "2026-07-15" })],
        },
      }),
    )
    expect(screen.getByText(/15 jul 2026/i)).toBeInTheDocument()
  })

  it("shows an 'Add date' placeholder when no date is set", () => {
    renderWithCtx(
      makeCtx({
        state: {
          points: [pt("p1", DAY1_ID)],
          pointOrder: ["p1"],
          pendingPointId: null,
          pendingPointName: null,
          savingCount: 0,
          days: [day(DAY1_ID, 1)],
        },
      }),
    )
    expect(screen.getByText("Add date")).toBeInTheDocument()
  })

  it("shows a day with no points as a disabled entry with placeholders", () => {
    renderWithCtx(
      makeCtx({
        state: {
          points: [pt("p1", DAY1_ID)],
          pointOrder: ["p1"],
          pendingPointId: null,
          pendingPointName: null,
          savingCount: 0,
          days: [day(DAY1_ID, 1), day(DAY2_ID, 2)],
        },
      }),
    )
    const entries = screen.getAllByTestId("day-rail-entry")
    expect(entries).toHaveLength(2)
    const empty = entries[1]
    expect(empty).toHaveAttribute("data-empty", "true")
    expect(empty).toBeDisabled()
    expect(screen.getByText("No points")).toBeInTheDocument()
  })

  it("shows a color swatch matching the day's route color", () => {
    renderWithCtx(makeCtx())
    const swatches = screen.getAllByTestId("day-color-swatch")
    expect(swatches[0]).toHaveStyle({ backgroundColor: getDayColor(1) })
    expect(swatches[1]).toHaveStyle({ backgroundColor: getDayColor(2) })
  })

  it("shows empty state message when there are no numbered days", () => {
    renderWithCtx(
      makeCtx({
        state: {
          points: [],
          pointOrder: [],
          pendingPointId: null,
          pendingPointName: null,
          savingCount: 0,
          days: [],
        },
      }),
    )
    expect(screen.queryAllByTestId("day-rail-entry")).toHaveLength(0)
    expect(screen.getByText(/no days/i)).toBeInTheDocument()
  })
})

// ─── selection ────────────────────────────────────────────────────────────────

describe("DayRail — selection", () => {
  it("clicking a day entry calls setSelectedDayId with its id", async () => {
    const setSelectedDayId = vi.fn()
    renderWithCtx(makeCtx({ setSelectedDayId }))
    await userEvent.click(screen.getAllByTestId("day-rail-entry")[0])
    expect(setSelectedDayId).toHaveBeenCalledWith(DAY1_ID)
  })

  it("clicking the active day entry calls setSelectedDayId(null)", async () => {
    const setSelectedDayId = vi.fn()
    renderWithCtx(makeCtx({ selectedDayId: DAY1_ID, setSelectedDayId }))
    await userEvent.click(screen.getAllByTestId("day-rail-entry")[0])
    expect(setSelectedDayId).toHaveBeenCalledWith(null)
  })

  it("active entry has data-selected attribute", () => {
    renderWithCtx(makeCtx({ selectedDayId: DAY1_ID }))
    const entries = screen.getAllByTestId("day-rail-entry")
    expect(entries[0]).toHaveAttribute("data-selected", "true")
    expect(entries[1]).not.toHaveAttribute("data-selected")
  })
})
