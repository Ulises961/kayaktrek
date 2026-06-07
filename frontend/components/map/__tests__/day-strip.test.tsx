import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import React, { createElement } from "react"
import { MapBuilderContext } from "@/lib/itinerary/map-builder-context"
import type { MapBuilderContextValue } from "@/lib/itinerary/map-builder-context"
import type { MapState } from "@/lib/itinerary/map-reducer"
import type { Point } from "@/lib/dtos/point"
import type { Day } from "@/lib/dtos/day"

vi.mock("@/lib/itinerary/actions", () => ({
  updatePoint: vi.fn().mockResolvedValue({ success: true }),
}))

vi.mock("../day-detail-panel", () => ({
  DayDetailPanel: () => <div data-testid="day-detail-panel" />,
}))

vi.mock("@/components/ui/carousel", () => ({
  Carousel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CarouselContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CarouselItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

import { DayStrip } from "../day-strip"

const DAY1_ID = "day-1"
const DAY2_ID = "day-2"
const ITIN_ID = "itin-1"

const pt = (id: string, dayId: string): Point => ({
  id, type: "position", latitude: 44 + Number(id.slice(-1)) * 0.01, longitude: 14, dayId,
})

const day = (id: string, dayNumber: number, extra: Partial<Day> = {}): Day => ({
  id, dayNumber, itineraryId: ITIN_ID, ...extra,
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
    selectedDayId: null,
    setSelectedDayId: vi.fn(),
    tripState: null,
    isLeader: true,
    selectedPointId: null,
    setSelectedPointId: vi.fn(),
    ...overrides,
  }
}

function renderWithCtx(ctx: MapBuilderContextValue) {
  return render(createElement(MapBuilderContext.Provider, { value: ctx }, createElement(DayStrip)))
}

beforeEach(() => vi.clearAllMocks())

describe("DayStrip — card count", () => {
  it("renders one card per numbered day", () => {
    renderWithCtx(makeCtx())
    expect(screen.getByText("Day 1")).toBeInTheDocument()
    expect(screen.getByText("Day 2")).toBeInTheDocument()
  })

  it("renders zero cards when there are no numbered days", () => {
    renderWithCtx(makeCtx({ state: { points: [], pointOrder: [], pendingPointId: null, pendingPointName: null, savingCount: 0, days: [] } }))
    expect(screen.queryByText(/Day \d/)).not.toBeInTheDocument()
  })
})

describe("DayStrip — selection", () => {
  it("calls setSelectedDayId with the day id when a card is clicked", async () => {
    const setSelectedDayId = vi.fn()
    renderWithCtx(makeCtx({ setSelectedDayId }))
    await userEvent.click(screen.getByText("Day 1"))
    expect(setSelectedDayId).toHaveBeenCalledWith(DAY1_ID)
  })

  it("calls setSelectedDayId(null) when the already-selected card is clicked", async () => {
    const setSelectedDayId = vi.fn()
    renderWithCtx(makeCtx({ selectedDayId: DAY1_ID, setSelectedDayId }))
    await userEvent.click(screen.getByText("Day 1"))
    expect(setSelectedDayId).toHaveBeenCalledWith(null)
  })

  it("renders DayDetailPanel when a day is selected", () => {
    renderWithCtx(makeCtx({ selectedDayId: DAY1_ID }))
    expect(screen.getByTestId("day-detail-panel")).toBeInTheDocument()
  })

  it("does not render DayDetailPanel when no day is selected", () => {
    renderWithCtx(makeCtx({ selectedDayId: null }))
    expect(screen.queryByTestId("day-detail-panel")).not.toBeInTheDocument()
  })
})
