import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

const { mockCreateItinerary, mockRefresh } = vi.hoisted(() => ({
  mockCreateItinerary: vi.fn(),
  mockRefresh: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}))

vi.mock("@/lib/itinerary/actions", () => ({
  createItinerary: mockCreateItinerary,
}))

import { ItineraryTab } from "../tabs/itinerary-tab"
import type { Itinerary } from "@/lib/dtos/itinerary"

const TRIP_ID = "01952f1a-0000-7000-8000-000000000001"
const ITINERARY_ID = "01952f1a-0000-7000-8000-000000000002"

const ITINERARY_NO_DAYS: Itinerary = {
  id: ITINERARY_ID,
  tripId: TRIP_ID,
  isPublic: false,
  totalMiles: 0,
  expectedTotalMiles: 50,
  days: [],
}

const ITINERARY_WITH_DAYS: Itinerary = {
  ...ITINERARY_NO_DAYS,
  totalMiles: 38.5,
  days: [
    { id: "01952f1a-0000-7000-8000-000000000010", dayNumber: 1, date: "2026-07-01" },
    { id: "01952f1a-0000-7000-8000-000000000011", dayNumber: 2, date: "2026-07-02" },
  ],
}

beforeEach(() => vi.clearAllMocks())

describe("ItineraryTab — no itinerary", () => {
  it("shows a create button for the leader", () => {
    render(<ItineraryTab tripId={TRIP_ID} itinerary={null} isLeader />)
    expect(screen.getByRole("button", { name: /create itinerary/i })).toBeDefined()
  })

  it("does not show a create button for non-leaders", () => {
    render(<ItineraryTab tripId={TRIP_ID} itinerary={null} isLeader={false} />)
    expect(screen.queryByRole("button", { name: /create itinerary/i })).toBeNull()
  })

  it("shows a 'no itinerary' message for non-leaders", () => {
    render(<ItineraryTab tripId={TRIP_ID} itinerary={null} isLeader={false} />)
    expect(screen.getByText(/no itinerary/i)).toBeDefined()
  })

  it("calls createItinerary with tripId and refreshes on button click", async () => {
    mockCreateItinerary.mockResolvedValue({ success: true, itineraryId: ITINERARY_ID })
    render(<ItineraryTab tripId={TRIP_ID} itinerary={null} isLeader />)
    await userEvent.click(screen.getByRole("button", { name: /create itinerary/i }))
    expect(mockCreateItinerary).toHaveBeenCalledWith({ tripId: TRIP_ID })
    expect(mockRefresh).toHaveBeenCalled()
  })
})

describe("ItineraryTab — draft (itinerary with no days)", () => {
  it("shows draft status", () => {
    render(<ItineraryTab tripId={TRIP_ID} itinerary={ITINERARY_NO_DAYS} isLeader />)
    expect(screen.getByText(/draft/i)).toBeDefined()
  })

  it("shows a link to the map builder", () => {
    render(<ItineraryTab tripId={TRIP_ID} itinerary={ITINERARY_NO_DAYS} isLeader />)
    const link = screen.getByRole("link", { name: /map builder/i })
    expect(link.getAttribute("href")).toBe(`/itinerary/${ITINERARY_ID}`)
  })
})

describe("ItineraryTab — itinerary with days", () => {
  it("shows day count", () => {
    render(<ItineraryTab tripId={TRIP_ID} itinerary={ITINERARY_WITH_DAYS} isLeader />)
    expect(screen.getByText(/2/)).toBeDefined()
  })

  it("shows total miles", () => {
    render(<ItineraryTab tripId={TRIP_ID} itinerary={ITINERARY_WITH_DAYS} isLeader />)
    expect(screen.getByText(/38\.5/)).toBeDefined()
  })

  it("shows 'open map builder' link to the itinerary route", () => {
    render(<ItineraryTab tripId={TRIP_ID} itinerary={ITINERARY_WITH_DAYS} isLeader />)
    const link = screen.getByRole("link", { name: /open map builder/i })
    expect(link.getAttribute("href")).toBe(`/itinerary/${ITINERARY_ID}`)
  })
})
