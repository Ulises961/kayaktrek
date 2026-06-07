import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import React, { createElement } from "react"
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
    // default ctx has isLeader: true → names are in inputs
    expect(screen.getByDisplayValue("Harbour")).toBeInTheDocument()
  })
})

describe("DayDetailPanel — point cards", () => {
  it("renders all points for the selected day", () => {
    renderWithCtx(makeCtx({ isLeader: false }))
    expect(screen.getByText("Harbour")).toBeInTheDocument()
    expect(screen.getByText("Cala Bianca")).toBeInTheDocument()
    expect(screen.getByText("44.0000°, 14.0000°")).toBeInTheDocument()
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

  it("shows the global index once per card as a standalone element", () => {
    renderWithCtx(makeCtx({ isLeader: true }))
    // p3 is at index 3 in pointOrder — index shows once, not recycled as name
    expect(screen.getByText("3")).toBeInTheDocument()
    // all test points share the same coords, so multiple placeholders exist — that's fine
    expect(screen.getAllByPlaceholderText("44.0000°, 14.0000°").length).toBeGreaterThan(0)
  })

  it("shows coord label as text for unnamed points (crew)", () => {
    renderWithCtx(makeCtx({ isLeader: false }))
    expect(screen.getByText("44.0000°, 14.0000°")).toBeInTheDocument()
  })

  it("shows notes preview for crew when point has notes", () => {
    const state = {
      points: [pt("p1", "Harbour", "Exposed beach landing")],
      pointOrder: ["p1"],
      pendingPointId: null, pendingPointName: null, savingCount: 0, days: [day1],
    }
    renderWithCtx(makeCtx({ state: state as never, isLeader: false }))
    expect(screen.getByText("Exposed beach landing")).toBeInTheDocument()
  })

  it("does not show notes text for crew when point has no notes", () => {
    renderWithCtx(makeCtx({ isLeader: false }))
    expect(screen.queryByPlaceholderText("Notes…")).not.toBeInTheDocument()
  })
})

describe("DayDetailPanel — leader vs crew", () => {
  it("renders editable name inputs for leaders", () => {
    renderWithCtx(makeCtx({ isLeader: true }))
    const nameInputs = screen.getAllByRole("textbox").filter(
      (el) => (el as HTMLInputElement).placeholder !== "Notes…"
    )
    expect(nameInputs).not.toHaveLength(0)
  })

  it("renders notes inputs for leaders", () => {
    renderWithCtx(makeCtx({ isLeader: true }))
    expect(screen.getAllByPlaceholderText("Notes…")).not.toHaveLength(0)
  })

  it("renders no editable inputs for crew", () => {
    renderWithCtx(makeCtx({ isLeader: false }))
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument()
  })

  it("calls updatePoint with notes on notes blur", async () => {
    renderWithCtx(makeCtx({ isLeader: true }))
    const notesInput = screen.getAllByPlaceholderText("Notes…")[0]
    await userEvent.click(notesInput)
    await userEvent.type(notesInput, "Tricky current")
    await userEvent.tab()
    expect(mockUpdatePoint).toHaveBeenCalledWith("p1", expect.objectContaining({ notes: "Tricky current" }))
  })

  it("calls updatePoint on blur when leader edits a name", async () => {
    renderWithCtx(makeCtx({ isLeader: true }))
    const nameInput = screen.getAllByRole("textbox").find(
      (el) => (el as HTMLInputElement).placeholder !== "Notes…"
    )!
    await userEvent.clear(nameInput)
    await userEvent.type(nameInput, "New Harbour")
    await userEvent.tab()
    expect(mockUpdatePoint).toHaveBeenCalledWith("p1", expect.objectContaining({ name: "New Harbour" }))
  })
})

describe("DayDetailPanel — past trip state", () => {
  it("renders no editable inputs for leader on a past trip", () => {
    renderWithCtx(makeCtx({ isLeader: true, tripState: "past" }))
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument()
  })

  it("shows read-only name spans for leader on a past trip", () => {
    renderWithCtx(makeCtx({ isLeader: true, tripState: "past" }))
    expect(screen.getByText("Harbour")).toBeInTheDocument()
    expect(screen.getByText("Cala Bianca")).toBeInTheDocument()
  })

  it("shows notes preview (not input) for leader on a past trip", () => {
    const state = {
      points: [pt("p1", "Harbour", "Rocky approach")],
      pointOrder: ["p1"],
      pendingPointId: null, pendingPointName: null, savingCount: 0, days: [day1],
    }
    renderWithCtx(makeCtx({ state: state as never, isLeader: true, tripState: "past" }))
    expect(screen.getByText("Rocky approach")).toBeInTheDocument()
    expect(screen.queryByPlaceholderText("Notes…")).not.toBeInTheDocument()
  })
})
