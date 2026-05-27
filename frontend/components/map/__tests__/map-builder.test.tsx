import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"

const { mockUseCollapseSidebar } = vi.hoisted(() => ({
  mockUseCollapseSidebar: vi.fn(),
}))

vi.mock("@/hooks/use-collapse-sidebar", () => ({
  useCollapseSidebar: mockUseCollapseSidebar,
}))

vi.mock("next/dynamic", () => ({
  default: (_importFn: unknown, _opts?: unknown) =>
    function MockMapCore() {
      return <div data-testid="map-core" />
    },
}))

vi.mock("../point-list-pane", () => ({
  PointListPane: () => <div data-testid="point-list-pane" />,
}))

vi.mock("@/lib/itinerary/actions", () => ({
  createDay: vi.fn().mockResolvedValue({ success: false }),
  updateDay: vi.fn().mockResolvedValue({ success: true }),
  deleteDay: vi.fn().mockResolvedValue({ success: true }),
  createPoint: vi.fn().mockResolvedValue({ success: false }),
  updatePoint: vi.fn().mockResolvedValue({ success: true }),
  deletePoint: vi.fn().mockResolvedValue({ success: true }),
  assignPointsToDay: vi.fn().mockResolvedValue({ success: true }),
}))

import { MapBuilder } from "../map-builder"
import type { Itinerary } from "@/lib/dtos/itinerary"

const TRIP_ID = "01952f1a-0000-7000-8000-000000000030"
const ITINERARY_ID = "01952f1a-0000-7000-8000-000000000020"

const ITINERARY: Itinerary = {
  id: ITINERARY_ID,
  isPublic: false,
  totalMiles: 0,
  tripId: TRIP_ID,
  days: [],
}

beforeEach(() => vi.clearAllMocks())

describe("MapBuilder", () => {
  it("collapses the sidebar on mount", () => {
    render(<MapBuilder itinerary={ITINERARY} tripId={TRIP_ID} tripName="Cinque Terre" />)
    expect(mockUseCollapseSidebar).toHaveBeenCalled()
  })

  it("renders the map top bar with the trip name", () => {
    render(<MapBuilder itinerary={ITINERARY} tripId={TRIP_ID} tripName="Cinque Terre" />)
    expect(screen.getByText("Cinque Terre")).toBeInTheDocument()
  })

  it("renders the map core", () => {
    render(<MapBuilder itinerary={ITINERARY} tripId={TRIP_ID} tripName="Cinque Terre" />)
    expect(screen.getByTestId("map-core")).toBeInTheDocument()
  })

  it("renders the point list pane", () => {
    render(<MapBuilder itinerary={ITINERARY} tripId={TRIP_ID} tripName="Cinque Terre" />)
    expect(screen.getByTestId("point-list-pane")).toBeInTheDocument()
  })

  it("counts only numbered days (excludes Day 0)", () => {
    const withDays: Itinerary = {
      ...ITINERARY,
      days: [
        { dayNumber: 0 },
        { dayNumber: 1 },
        { dayNumber: 2 },
      ],
    }
    render(<MapBuilder itinerary={withDays} tripId={TRIP_ID} tripName="Cinque Terre" />)
    expect(screen.getByText("2 days")).toBeInTheDocument()
  })

  it("shows 0 days for an empty itinerary", () => {
    render(<MapBuilder itinerary={ITINERARY} tripId={TRIP_ID} tripName="Cinque Terre" />)
    expect(screen.getByText("0 days")).toBeInTheDocument()
  })
})
