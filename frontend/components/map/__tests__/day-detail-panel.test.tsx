import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import React, { createElement } from "react"
import { MapBuilderContext } from "@/lib/itinerary/map-builder-context"
import type { MapBuilderContextValue } from "@/lib/itinerary/map-builder-context"
import type { MapState } from "@/lib/itinerary/map-reducer"
import type { Point } from "@/lib/dtos/point"
import type { Day } from "@/lib/dtos/day"

vi.mock("@/components/ui/carousel", () => ({
  Carousel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CarouselContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CarouselItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock("@/lib/itinerary/actions", () => ({
  updateDay: vi.fn().mockResolvedValue({ success: true, day: {} }),
}))

import { DayDetailPanel } from "../day-detail-panel"

const DAY1_ID = "day-1"
const ITIN_ID = "itin-1"

const pt = (id: string, name?: string, notes?: string): Point => ({
  id,
  type: "position",
  latitude: 44,
  longitude: 14,
  dayId: DAY1_ID,
  name: name ?? undefined,
  notes: notes ?? undefined,
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
    selectedPointId: null,
    setSelectedPointId: vi.fn(),
    tripState: null,
    isLeader: true,
    selectedHour: 12,
    setSelectedHour: vi.fn(),
    ...overrides,
  }
}

function renderWithCtx(ctx: MapBuilderContextValue) {
  return render(
    createElement(MapBuilderContext.Provider, { value: ctx }, createElement(DayDetailPanel)),
  )
}

beforeEach(() => vi.clearAllMocks())

describe("DayDetailPanel — visibility", () => {
  it("renders nothing when selectedDayId is null", () => {
    const { container } = renderWithCtx(makeCtx({ selectedDayId: null }))
    expect(container.firstChild).toBeNull()
  })
})

describe("DayDetailPanel — date header", () => {
  it("shows the day number", () => {
    renderWithCtx(makeCtx())
    expect(screen.getByText("Day 1")).toBeInTheDocument()
  })

  it("shows 'No date set' when the day has no date", () => {
    renderWithCtx(makeCtx())
    expect(screen.getByText("No date set")).toBeInTheDocument()
  })

  it("shows the formatted date when the day has one", () => {
    const stateWithDate = {
      ...makeCtx().state,
      days: [{ ...day1, date: "2026-06-15" }],
    }
    renderWithCtx(makeCtx({ state: stateWithDate as never }))
    expect(screen.getByText("Jun 15")).toBeInTheDocument()
  })

  it("shows the edit-date button for leaders", () => {
    renderWithCtx(makeCtx({ isLeader: true }))
    expect(screen.getByRole("button", { name: /edit date/i })).toBeInTheDocument()
  })

  it("hides the edit-date button for crew", () => {
    renderWithCtx(makeCtx({ isLeader: false }))
    expect(screen.queryByRole("button", { name: /edit date/i })).not.toBeInTheDocument()
  })

  it("reveals the date input after clicking the edit button", async () => {
    renderWithCtx(makeCtx({ isLeader: true }))
    await userEvent.click(screen.getByRole("button", { name: /edit date/i }))
    expect(screen.getByTestId("date-input")).toBeInTheDocument()
  })
})

describe("DayDetailPanel — points section", () => {
  it("shows the waypoints button with the point count", () => {
    renderWithCtx(makeCtx())
    expect(screen.getByRole("button", { name: /waypoints \(3\)/i })).toBeInTheDocument()
  })

  it("hides point cards until the section is expanded", () => {
    renderWithCtx(makeCtx())
    expect(screen.queryByText("Harbour")).not.toBeInTheDocument()
  })

  it("renders all points for the selected day after expanding", async () => {
    renderWithCtx(makeCtx())
    await userEvent.click(screen.getByRole("button", { name: /waypoints/i }))
    expect(screen.getByText("Harbour")).toBeInTheDocument()
    expect(screen.getByText("Cala Bianca")).toBeInTheDocument()
    expect(screen.getByText("44.0000°, 14.0000°")).toBeInTheDocument()
  })

  it("shows the global index for each card", async () => {
    renderWithCtx(makeCtx())
    await userEvent.click(screen.getByRole("button", { name: /waypoints/i }))
    expect(screen.getByText("1")).toBeInTheDocument()
    expect(screen.getByText("2")).toBeInTheDocument()
    expect(screen.getByText("3")).toBeInTheDocument()
  })

  it("falls back to coord label for unnamed points", async () => {
    renderWithCtx(makeCtx())
    await userEvent.click(screen.getByRole("button", { name: /waypoints/i }))
    expect(screen.getByText("44.0000°, 14.0000°")).toBeInTheDocument()
  })

  it("shows notes preview when a point has notes", async () => {
    const state = {
      points: [pt("p1", "Harbour", "Exposed beach landing")],
      pointOrder: ["p1"],
      pendingPointId: null,
      pendingPointName: null,
      savingCount: 0,
      days: [day1],
    }
    renderWithCtx(makeCtx({ state: state as never }))
    await userEvent.click(screen.getByRole("button", { name: /waypoints/i }))
    expect(screen.getByText("Exposed beach landing")).toBeInTheDocument()
  })

  it("point cards have no editable inputs", async () => {
    renderWithCtx(makeCtx({ isLeader: true }))
    await userEvent.click(screen.getByRole("button", { name: /waypoints/i }))
    // The only interactive element inside a card is the card button itself.
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument()
    expect(screen.queryByRole("spinbutton")).not.toBeInTheDocument()
  })

  it("each card calls setSelectedPointId when clicked", async () => {
    const setSelectedPointId = vi.fn()
    renderWithCtx(makeCtx({ setSelectedPointId }))
    await userEvent.click(screen.getByRole("button", { name: /waypoints/i }))
    // Find the card wrapping "Harbour"
    const harbourCard = screen.getByText("Harbour").closest("[role=button]") as HTMLElement
    await userEvent.click(harbourCard)
    expect(setSelectedPointId).toHaveBeenCalledWith("p1")
  })
})

describe("DayDetailPanel — hour slider", () => {
  it("renders the hour slider with the context selectedHour value", () => {
    renderWithCtx(makeCtx({ selectedHour: 9 }))
    const slider = screen.getByTestId("hour-slider")
    expect(slider).toBeInTheDocument()
    expect(slider).toHaveValue("9")
  })

  it("displays the current hour as HH:00", () => {
    renderWithCtx(makeCtx({ selectedHour: 6 }))
    expect(screen.getByText("06:00")).toBeInTheDocument()
  })

  it("calls setSelectedHour when the slider changes", () => {
    const setSelectedHour = vi.fn()
    renderWithCtx(makeCtx({ selectedHour: 12, setSelectedHour }))
    const slider = screen.getByTestId("hour-slider")
    fireEvent.change(slider, { target: { value: "18" } })
    expect(setSelectedHour).toHaveBeenCalledWith(18)
  })

  it("has min=0 and max=23 range", () => {
    renderWithCtx(makeCtx())
    const slider = screen.getByTestId("hour-slider")
    expect(slider).toHaveAttribute("min", "0")
    expect(slider).toHaveAttribute("max", "23")
  })
})
