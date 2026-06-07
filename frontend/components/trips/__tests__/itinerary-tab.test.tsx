import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

const { mockCreateItinerary, mockPush } = vi.hoisted(() => ({
  mockCreateItinerary: vi.fn(),
  mockPush: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}))

vi.mock("@/lib/itinerary/actions", () => ({
  createItinerary: mockCreateItinerary,
}))

import { ItineraryTab } from "../tabs/itinerary-tab"
import type { Itinerary } from "@/lib/dtos/itinerary"
import type { Day } from "@/lib/dtos/day"
import type { Point } from "@/lib/dtos/point"

const TRIP_ID    = "01952f1a-0000-7000-8000-000000000001"
const ITIN_ID    = "01952f1a-0000-7000-8000-000000000002"
const DAY_1_ID   = "01952f1a-0000-7000-8000-000000000010"
const DAY_2_ID   = "01952f1a-0000-7000-8000-000000000011"
const PT_A_ID    = "01952f1a-0000-7000-8000-100000000001"
const PT_B_ID    = "01952f1a-0000-7000-8000-100000000002"
const PT_C_ID    = "01952f1a-0000-7000-8000-100000000003"

const PT_A: Point = {
  id: PT_A_ID, type: "stop", latitude: 43.5, longitude: -8.0,
  name: "Ribadeo", nextId: PT_B_ID, dayId: DAY_1_ID,
}
const PT_B: Point = {
  id: PT_B_ID, type: "position", latitude: 43.6, longitude: -8.1,
  name: null, nextId: PT_C_ID, dayId: DAY_1_ID,
}
const PT_C: Point = {
  id: PT_C_ID, type: "stop", latitude: 43.7, longitude: -7.9,
  name: "Foz", nextId: null, dayId: DAY_1_ID,
}

const DAY_WITH_POINTS: Day = {
  id: DAY_1_ID, dayNumber: 1, date: "2026-07-01",
  startPointId: PT_A_ID, endPointId: PT_C_ID,
  points: [PT_A, PT_B, PT_C],
}

const DAY_REST: Day = {
  id: DAY_2_ID, dayNumber: 2, date: "2026-07-03",
  startPointId: null, endPointId: null,
  points: [],
}

const ITIN_NO_DAYS: Itinerary = {
  id: ITIN_ID, tripId: TRIP_ID,
  isPublic: false, totalMiles: 0, days: [],
}

const ITIN_WITH_DAYS: Itinerary = {
  id: ITIN_ID, tripId: TRIP_ID, isPublic: false,
  totalMiles: 22.4, avgSpeedKnots: 2.5,
  days: [DAY_WITH_POINTS, DAY_REST],
}

// 6 days so "show all" toggle appears
const MANY_DAYS: Day[] = Array.from({ length: 6 }, (_, i) => ({
  id: `01952f1a-0000-7000-8000-00000000002${i}`,
  dayNumber: i + 1,
  date: `2026-07-0${i + 1}`,
  startPointId: null, endPointId: null, points: [],
}))

const ITIN_MANY_DAYS: Itinerary = {
  ...ITIN_WITH_DAYS, days: MANY_DAYS,
}

beforeEach(() => vi.clearAllMocks())

// ---------------------------------------------------------------------------
// No itinerary
// ---------------------------------------------------------------------------

describe("ItineraryTab — no itinerary", () => {
  it("shows a name input for the leader", () => {
    render(<ItineraryTab tripId={TRIP_ID} itinerary={null} isLeader />)
    expect(screen.getByRole("textbox")).toBeDefined()
  })

  it("shows a create button for the leader", () => {
    render(<ItineraryTab tripId={TRIP_ID} itinerary={null} isLeader />)
    expect(screen.getByRole("button", { name: /create itinerary/i })).toBeDefined()
  })

  it("create button is disabled when name is empty", () => {
    render(<ItineraryTab tripId={TRIP_ID} itinerary={null} isLeader />)
    const btn = screen.getByRole("button", { name: /create itinerary/i }) as HTMLButtonElement
    expect(btn.disabled).toBe(true)
  })

  it("calls createItinerary with name and tripId on submit", async () => {
    mockCreateItinerary.mockResolvedValue({ success: true, itineraryId: ITIN_ID })
    render(<ItineraryTab tripId={TRIP_ID} itinerary={null} isLeader />)
    await userEvent.type(screen.getByRole("textbox"), "Galician Coast")
    await userEvent.click(screen.getByRole("button", { name: /create itinerary/i }))
    expect(mockCreateItinerary).toHaveBeenCalledWith({ tripId: TRIP_ID, name: "Galician Coast" })
  })

  it("navigates to the itinerary page on success", async () => {
    mockCreateItinerary.mockResolvedValue({ success: true, itineraryId: ITIN_ID })
    render(<ItineraryTab tripId={TRIP_ID} itinerary={null} isLeader />)
    await userEvent.type(screen.getByRole("textbox"), "Galician Coast")
    await userEvent.click(screen.getByRole("button", { name: /create itinerary/i }))
    expect(mockPush).toHaveBeenCalledWith(`/itinerary/${ITIN_ID}`)
  })

  it("shows no itinerary message for crew", () => {
    render(<ItineraryTab tripId={TRIP_ID} itinerary={null} isLeader={false} />)
    expect(screen.getByText(/no itinerary/i)).toBeDefined()
  })

  it("does not show a create button for crew", () => {
    render(<ItineraryTab tripId={TRIP_ID} itinerary={null} isLeader={false} />)
    expect(screen.queryByRole("button", { name: /create itinerary/i })).toBeNull()
  })

  it("pre-fills the name input with tripName when provided", () => {
    render(<ItineraryTab tripId={TRIP_ID} itinerary={null} isLeader tripName="Costa Brava" />)
    const input = screen.getByRole("textbox") as HTMLInputElement
    expect(input.value).toBe("Costa Brava")
  })

  it("leaves the name input empty when tripName is not provided", () => {
    render(<ItineraryTab tripId={TRIP_ID} itinerary={null} isLeader />)
    const input = screen.getByRole("textbox") as HTMLInputElement
    expect(input.value).toBe("")
  })
})

// ---------------------------------------------------------------------------
// Draft (itinerary exists, no days)
// ---------------------------------------------------------------------------

describe("ItineraryTab — draft (itinerary with no days)", () => {
  it("shows draft status", () => {
    render(<ItineraryTab tripId={TRIP_ID} itinerary={ITIN_NO_DAYS} isLeader />)
    expect(screen.getByText(/draft/i)).toBeDefined()
  })

  it("shows a link to the itinerary page", () => {
    render(<ItineraryTab tripId={TRIP_ID} itinerary={ITIN_NO_DAYS} isLeader />)
    const link = screen.getByRole("link", { name: /open itinerary/i })
    expect(link.getAttribute("href")).toBe(`/itinerary/${ITIN_ID}`)
  })
})

// ---------------------------------------------------------------------------
// With days
// ---------------------------------------------------------------------------

describe("ItineraryTab — itinerary with days", () => {
  it("shows day count in stats strip", () => {
    render(<ItineraryTab tripId={TRIP_ID} itinerary={ITIN_WITH_DAYS} isLeader />)
    // day count and label are in nested spans; match the parent element's textContent
    const el = screen.getByText((_, node) =>
      node?.textContent?.replace(/\s+/g, " ").trim() === "2 days"
    )
    expect(el).toBeDefined()
  })

  it("shows total distance in stats strip", () => {
    render(<ItineraryTab tripId={TRIP_ID} itinerary={ITIN_WITH_DAYS} isLeader />)
    expect(screen.getByText(/22\.4 nm/)).toBeDefined()
  })

  it("shows date range", () => {
    render(<ItineraryTab tripId={TRIP_ID} itinerary={ITIN_WITH_DAYS} isLeader />)
    expect(screen.getByText(/2026-07-01.*2026-07-03/)).toBeDefined()
  })

  it("renders a row for each day", () => {
    render(<ItineraryTab tripId={TRIP_ID} itinerary={ITIN_WITH_DAYS} isLeader />)
    expect(screen.getByText(/Day 1/)).toBeDefined()
    expect(screen.getByText(/Day 2/)).toBeDefined()
  })

  it("shows start and end names for days with points", () => {
    render(<ItineraryTab tripId={TRIP_ID} itinerary={ITIN_WITH_DAYS} isLeader />)
    expect(screen.getByText(/Ribadeo.*Foz/)).toBeDefined()
  })

  it("shows rest day label for days without points", () => {
    render(<ItineraryTab tripId={TRIP_ID} itinerary={ITIN_WITH_DAYS} isLeader />)
    expect(screen.getByText(/rest day/i)).toBeDefined()
  })

  it("shows Open itinerary link for leader", () => {
    render(<ItineraryTab tripId={TRIP_ID} itinerary={ITIN_WITH_DAYS} isLeader />)
    const link = screen.getByRole("link", { name: /open itinerary/i })
    expect(link.getAttribute("href")).toBe(`/itinerary/${ITIN_ID}`)
  })

  it("shows Open itinerary link for crew too", () => {
    render(<ItineraryTab tripId={TRIP_ID} itinerary={ITIN_WITH_DAYS} isLeader={false} />)
    const link = screen.getByRole("link", { name: /open itinerary/i })
    expect(link.getAttribute("href")).toBe(`/itinerary/${ITIN_ID}`)
  })

  it("collapses to 5 days and shows a show-all toggle", () => {
    render(<ItineraryTab tripId={TRIP_ID} itinerary={ITIN_MANY_DAYS} isLeader />)
    expect(screen.queryByText(/Day 6/)).toBeNull()
    expect(screen.getByRole("button", { name: /show all/i })).toBeDefined()
  })

  it("show-all toggle reveals remaining days", async () => {
    render(<ItineraryTab tripId={TRIP_ID} itinerary={ITIN_MANY_DAYS} isLeader />)
    await userEvent.click(screen.getByRole("button", { name: /show all/i }))
    expect(screen.getByText(/Day 6/)).toBeDefined()
  })
})
