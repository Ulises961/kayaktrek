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
vi.mock("@/lib/trip-member/actions", () => ({
  updateMyFloatPlan: vi.fn(),
  shareMedicalNotes: vi.fn(),
}))
vi.mock("@/lib/profile/actions", () => ({
  reAuth: vi.fn(),
  getMedicalNotes: vi.fn(),
}))
vi.mock("@/lib/itinerary/actions", () => ({ createItinerary: vi.fn() }))

import { TripDetailTabs } from "../trip-detail-tabs"
import type { Trip } from "@/lib/dtos/trip"
import type { TripMember } from "@/lib/dtos/trip-member"

const TRIP_ID = "01952f1a-0000-7000-8000-000000000001"

const TRIP: Trip = {
  id: TRIP_ID,
  destination: "Isle of Skye",
  state: "building",
  dateFrom: "2026-07-01",
  dateTo: "2026-07-07",
  description: "A coastal circumnavigation",
  difficulty: "moderate",
  travellers: [
    {
      id: "01952f1a-0000-7000-8000-000000000010",
      role: "leader",
      user: {
        id: "01952f1a-0000-7000-8000-000000000011",
        mail: "ana@example.com",
        username: "ana",
        name: "Ana",
        surname: "Font",
      },
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

const CURRENT_MEMBER: TripMember = {
  id: "01952f1a-0000-7000-8000-000000000010",
  role: "leader",
  user: {
    id: "01952f1a-0000-7000-8000-000000000011",
    mail: "ana@example.com",
    username: "ana",
    name: "Ana",
    surname: "Font",
  },
  vesselMake: null,
  vesselModel: null,
  vesselLengthCm: null,
  vesselColorPrimary: null,
  vesselColorSecondary: null,
  emergencyContactName: null,
  emergencyContactPhone: null,
  emergencyContactRelationship: null,
  medicalNotesConsentAt: null,
  floatPlanConfirmedAt: "2026-05-01T10:00:00",
}

describe("TripDetailTabs", () => {
  it("renders crew, logistics, itinerary, and items tab triggers", () => {
    render(<TripDetailTabs {...BASE_PROPS} />)
    expect(screen.getByRole("tab", { name: /crew/i })).toBeDefined()
    expect(screen.getByRole("tab", { name: /logistics/i })).toBeDefined()
    expect(screen.getByRole("tab", { name: /itinerary/i })).toBeDefined()
    expect(screen.getByRole("tab", { name: /items/i })).toBeDefined()
  })

  it("shows float plan tab trigger when currentMember is provided", () => {
    render(<TripDetailTabs {...BASE_PROPS} currentMember={CURRENT_MEMBER} />)
    expect(screen.getByRole("tab", { name: /float plan/i })).toBeDefined()
  })

  it("does not show float plan tab trigger when currentMember is absent", () => {
    render(<TripDetailTabs {...BASE_PROPS} currentMember={undefined} />)
    expect(screen.queryByRole("tab", { name: /float plan/i })).toBeNull()
  })

  it("shows itinerary tab content by default", () => {
    render(<TripDetailTabs {...BASE_PROPS} />)
    // leader + no itinerary → create form is shown on the default tab
    expect(screen.getByRole("button", { name: /create itinerary/i })).toBeDefined()
  })

  it("shows create itinerary button for leader in itinerary tab", async () => {
    render(<TripDetailTabs {...BASE_PROPS} />)
    expect(screen.getByRole("button", { name: /create itinerary/i })).toBeDefined()
  })

  it("shows the trip inventory section when the items tab is active", async () => {
    render(<TripDetailTabs {...BASE_PROPS} />)
    await userEvent.click(screen.getByRole("tab", { name: /items/i }))
    // Every trip auto-creates its inventory, so there is no create-inventory button.
    expect(screen.getByText(/trip inventory/i)).toBeDefined()
    expect(screen.queryByRole("button", { name: /create trip inventory/i })).toBeNull()
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
      expect.any(Object),
    )
  })
})
