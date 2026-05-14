import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

const mockReplace = vi.fn()

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace }),
  useSearchParams: () => new URLSearchParams(""),
}))

vi.mock("@/lib/logistics/actions", () => ({ upsertLogistics: vi.fn() }))
vi.mock("@/lib/travel-documents/actions", () => ({
  uploadTravelDocumentAttachment: vi.fn(),
  deleteTravelDocumentAttachment: vi.fn(),
  getTravelDocumentAttachmentUrl: vi.fn(),
}))
vi.mock("@/lib/shuttle/actions", () => ({
  addShuttlePassenger: vi.fn(),
  removeShuttlePassenger: vi.fn(),
}))

import { TripDetailTabs } from "../trip-detail-tabs"
import type { Trip } from "@/lib/dtos/trip"

const TRIP_ID = "01952f1a-0000-7000-8000-000000000001"

const TRIP: Trip = {
  id: TRIP_ID,
  destination: "Isle of Skye",
  state: "planning",
  dateFrom: "2026-07-01",
  dateTo: "2026-07-07",
  description: "A coastal circumnavigation",
  difficulty: "moderate",
  travellers: [
    {
      id: "01952f1a-0000-7000-8000-000000000010",
      role: "leader",
      user: { id: "01952f1a-0000-7000-8000-000000000011", mail: "ana@example.com", username: "ana", name: "Ana", surname: "Font" },
    },
  ],
  pendingTravellers: [],
}

const BASE_PROPS = {
  tripId: TRIP_ID,
  trip: TRIP,
  logistics: null,
  travelDocuments: [],
  shuttleVehicles: [],
  today: "2026-05-11",
  isLeader: true,
  isMember: true,
  currentMemberId: "01952f1a-0000-7000-8000-000000000010",
  currentUserId: "01952f1a-0000-7000-8000-000000000011",
  leaderId: "01952f1a-0000-7000-8000-000000000011",
}

beforeEach(() => vi.clearAllMocks())

describe("TripDetailTabs", () => {
  it("renders all four tab triggers", () => {
    render(<TripDetailTabs {...BASE_PROPS} />)
    expect(screen.getByRole("tab", { name: /crew/i })).toBeDefined()
    expect(screen.getByRole("tab", { name: /logistics/i })).toBeDefined()
    expect(screen.getByRole("tab", { name: /itinerary/i })).toBeDefined()
    expect(screen.getByRole("tab", { name: /items/i })).toBeDefined()
  })

  it("shows crew content by default", () => {
    render(<TripDetailTabs {...BASE_PROPS} />)
    expect(screen.getAllByText(/crew/i).length).toBeGreaterThan(0)
  })

  it("shows itinerary placeholder when itinerary tab is clicked", async () => {
    render(<TripDetailTabs {...BASE_PROPS} />)
    await userEvent.click(screen.getByRole("tab", { name: /itinerary/i }))
    expect(screen.getByText(/M4/i)).toBeDefined()
  })

  it("shows items placeholder when items tab is active", async () => {
    render(<TripDetailTabs {...BASE_PROPS} />)
    await userEvent.click(screen.getByRole("tab", { name: /items/i }))
    expect(screen.getByText(/M6/i)).toBeDefined()
  })

  it("shows logistics content when logistics tab is active", async () => {
    render(<TripDetailTabs {...BASE_PROPS} />)
    await userEvent.click(screen.getByRole("tab", { name: /logistics/i }))
    expect(screen.getByText(/travel documents/i)).toBeDefined()
  })

  it("replaces URL when a tab is clicked", async () => {
    render(<TripDetailTabs {...BASE_PROPS} />)
    await userEvent.click(screen.getByRole("tab", { name: /logistics/i }))
    expect(mockReplace).toHaveBeenCalledWith(
      expect.stringContaining("tab=logistics"),
      expect.any(Object)
    )
  })
})
