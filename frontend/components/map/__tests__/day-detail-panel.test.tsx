import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
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

import { DayDetailPanel } from "../day-detail-panel"

const DAY1_ID = "day-1"
const ITIN_ID = "itin-1"

const pt = (id: string, name?: string, notes?: string): Point => ({
  id, type: "position", latitude: 44, longitude: 14, dayId: DAY1_ID,
  name: name ?? undefined, notes: notes ?? undefined,
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
    ...overrides,
  }
}

function renderWithCtx(ctx: MapBuilderContextValue) {
  return render(createElement(MapBuilderContext.Provider, { value: ctx }, createElement(DayDetailPanel)))
}

beforeEach(() => vi.clearAllMocks())

describe("DayDetailPanel — visibility", () => {
  it("renders nothing when selectedDayId is null", () => {
    const { container } = renderWithCtx(makeCtx({ selectedDayId: null }))
    expect(container.firstChild).toBeNull()
  })

  it("renders point cards when selectedDayId is set", () => {
    renderWithCtx(makeCtx())
    expect(screen.getByText("Harbour")).toBeInTheDocument()
  })
})

describe("DayDetailPanel — point cards", () => {
  it("renders all points for the selected day", () => {
    renderWithCtx(makeCtx())
    expect(screen.getByText("Harbour")).toBeInTheDocument()
    expect(screen.getByText("Cala Bianca")).toBeInTheDocument()
    expect(screen.getByText("44.0000°, 14.0000°")).toBeInTheDocument()
  })

  it("shows the global index for each card", () => {
    renderWithCtx(makeCtx())
    expect(screen.getByText("1")).toBeInTheDocument()
    expect(screen.getByText("2")).toBeInTheDocument()
    expect(screen.getByText("3")).toBeInTheDocument()
  })

  it("falls back to coord label for unnamed points", () => {
    renderWithCtx(makeCtx())
    expect(screen.getByText("44.0000°, 14.0000°")).toBeInTheDocument()
  })

  it("shows notes preview when point has notes", () => {
    const state = {
      points: [pt("p1", "Harbour", "Exposed beach landing")],
      pointOrder: ["p1"],
      pendingPointId: null, pendingPointName: null, savingCount: 0, days: [day1],
    }
    renderWithCtx(makeCtx({ state: state as never }))
    expect(screen.getByText("Exposed beach landing")).toBeInTheDocument()
  })

  it("does not show notes text when point has no notes", () => {
    renderWithCtx(makeCtx())
    // p1 and p2 have no notes — no notes paragraph should appear
    expect(screen.queryByText(/entrance|current|landing/)).not.toBeInTheDocument()
  })

  it("cards are always read-only — no editable inputs", () => {
    renderWithCtx(makeCtx({ isLeader: true }))
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument()
  })

  it("cards have no inputs even for crew", () => {
    renderWithCtx(makeCtx({ isLeader: false }))
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument()
  })

  it("each card is a button that calls setSelectedPointId on click", async () => {
    const setSelectedPointId = vi.fn()
    const { getAllByRole } = renderWithCtx(makeCtx({ setSelectedPointId }))
    const cards = getAllByRole("button")
    cards[0].click()
    expect(setSelectedPointId).toHaveBeenCalledWith("p1")
  })
})
