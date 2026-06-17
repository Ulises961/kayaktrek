import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { createElement } from "react"
import { MapBuilderContext } from "@/lib/itinerary/map-builder-context"
import type { MapBuilderContextValue } from "@/lib/itinerary/map-builder-context"
import type { MapState } from "@/lib/itinerary/map-reducer"
import type { Point } from "@/lib/dtos/point"

vi.mock("@/lib/itinerary/actions", () => ({
  updatePoint: vi.fn().mockResolvedValue({ success: true }),
}))

import { PointDetailModal } from "../point-detail-modal"
import * as actions from "@/lib/itinerary/actions"

const POINT: Point = {
  id: "p1",
  type: "interest",
  name: "Vikten Sea Caves",
  notes: "Only enter near slack water.",
  latitude: 68.071,
  longitude: 13.512,
  dayId: "day-1",
  images: [
    { id: "i1", location: "https://example.com/1.jpg", name: "one", size: 1000 },
    { id: "i2", location: "https://example.com/2.jpg", name: "two", size: 2000 },
  ],
}

const baseCtx: MapBuilderContextValue = {
  state: {
    points: [POINT],
    pointOrder: ["p1"],
    pendingPointId: null,
    pendingPointName: null,
    savingCount: 0,
    days: [],
  } as MapState,
  dispatch: vi.fn(),
  draftSlices: null,
  setDraftSlices: vi.fn(),
  tripId: null,
  tripName: "Test Trip",
  itineraryId: "itin-1",
  distanceUnit: "nm",
  setDistanceUnit: vi.fn(),
  avgSpeedKnots: 2.5,
  setAvgSpeedKnots: vi.fn(),
  activePointId: null,
  setActivePointId: vi.fn(),
  day0Id: "day-0",
  viewMode: true,
  setViewMode: vi.fn(),
  selectedDayId: "day-1",
  setSelectedDayId: vi.fn(),
  selectedPointId: "p1",
  setSelectedPointId: vi.fn(),
  tripState: null,
  isLeader: true,
  selectedHour: 12,
  setSelectedHour: vi.fn(),
  conditionsVersion: 0,
  bumpConditions: vi.fn(),
}

function renderModal(point: Point, canEdit = true, onClose = vi.fn()) {
  return render(
    createElement(
      MapBuilderContext.Provider,
      { value: baseCtx },
      createElement(PointDetailModal, { point, canEdit, onClose }),
    ),
  )
}

beforeEach(() => vi.clearAllMocks())

describe("PointDetailModal", () => {
  it("shows the point name, type and coordinates", () => {
    renderModal(POINT)
    expect(screen.getByText("Vikten Sea Caves")).toBeInTheDocument()
    expect(screen.getByText("interest")).toBeInTheDocument()
    expect(screen.getByText(/68\.071°N · 13\.512°E/)).toBeInTheDocument()
  })

  it("shows the image carousel position", () => {
    renderModal(POINT)
    expect(screen.getByText("1 / 2")).toBeInTheDocument()
  })

  it("advances the carousel with the next button", async () => {
    renderModal(POINT)
    await userEvent.click(screen.getByRole("button", { name: /next photo/i }))
    expect(screen.getByText("2 / 2")).toBeInTheDocument()
  })

  it("shows a 'No photos yet' empty state when there are no images", () => {
    renderModal({ ...POINT, images: [] })
    expect(screen.getByText(/no photos yet/i)).toBeInTheDocument()
  })

  it("renders an editable notes field when editable and persists on blur", async () => {
    renderModal(POINT, true)
    const textarea = screen.getByRole("textbox")
    await userEvent.clear(textarea)
    await userEvent.type(textarea, "New note")
    await userEvent.tab()
    expect(actions.updatePoint).toHaveBeenCalledWith("p1", { notes: "New note" })
  })

  it("renders notes read-only when not editable", () => {
    renderModal(POINT, false)
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument()
    expect(screen.getByText("Only enter near slack water.")).toBeInTheDocument()
  })
})
