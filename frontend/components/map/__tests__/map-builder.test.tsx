import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

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

vi.mock("../day-strip", () => ({
  DayStrip: () => <div data-testid="day-strip" />,
}))

vi.mock("@/lib/itinerary/actions", () => ({
  createDay: vi.fn().mockResolvedValue({ success: false }),
  updateDay: vi.fn().mockResolvedValue({ success: true }),
  deleteDay: vi.fn().mockResolvedValue({ success: true }),
  createPoint: vi.fn().mockResolvedValue({ success: false }),
  updatePoint: vi.fn().mockResolvedValue({ success: true }),
  deletePoint: vi.fn().mockResolvedValue({ success: true }),
  assignPointsToDay: vi.fn().mockResolvedValue({ success: true }),
  updateItinerary: vi.fn().mockResolvedValue({ success: true }),
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

  it("renders the day strip in view mode (default)", () => {
    render(<MapBuilder itinerary={ITINERARY} tripId={TRIP_ID} tripName="Cinque Terre" />)
    expect(screen.getByTestId("day-strip")).toBeInTheDocument()
  })

  it("does not render point list pane in view mode (default)", () => {
    render(<MapBuilder itinerary={ITINERARY} tripId={TRIP_ID} tripName="Cinque Terre" />)
    expect(screen.queryByTestId("point-list-pane")).not.toBeInTheDocument()
  })

  it("renders the point list pane in edit mode after clicking 'Edit route'", async () => {
    render(<MapBuilder itinerary={ITINERARY} tripId={TRIP_ID} tripName="Cinque Terre" isLeader={true} tripState="building" />)
    await userEvent.click(screen.getByRole("button", { name: "Edit route" }))
    expect(screen.getByTestId("point-list-pane")).toBeInTheDocument()
  })

  it("returns to view mode and shows day strip after clicking 'Done'", async () => {
    render(<MapBuilder itinerary={ITINERARY} tripId={TRIP_ID} tripName="Cinque Terre" isLeader={true} tripState="building" />)
    await userEvent.click(screen.getByRole("button", { name: "Edit route" }))
    await userEvent.click(screen.getByRole("button", { name: "Done" }))
    expect(screen.getByTestId("day-strip")).toBeInTheDocument()
    expect(screen.queryByTestId("point-list-pane")).not.toBeInTheDocument()
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
    expect(within(screen.getByTestId("stats-strip")).getByText("2 days")).toBeInTheDocument()
  })

  it("shows 0 days for an empty itinerary", () => {
    render(<MapBuilder itinerary={ITINERARY} tripId={TRIP_ID} tripName="Cinque Terre" />)
    expect(within(screen.getByTestId("stats-strip")).getByText("0 days")).toBeInTheDocument()
  })
})
