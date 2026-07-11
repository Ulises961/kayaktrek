import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { EditTripForm } from "../edit-trip-form"
import type { Trip } from "@/lib/dtos/trip"

const { mockUpdateTrip, mockPush } = vi.hoisted(() => ({
  mockUpdateTrip: vi.fn(),
  mockPush: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}))

vi.mock("@/lib/trips/actions", () => ({
  updateTrip: mockUpdateTrip,
}))

const TRIP: Trip = {
  id: "01952f1a-0000-7000-8000-000000000001",
  destination: "Cinque Terre",
  description: "A coastal paddle",
  dateFrom: "2026-07-01",
  dateTo: "2026-07-05",
  difficulty: "moderate",
}

beforeEach(() => vi.clearAllMocks())

describe("EditTripForm — difficulty field", () => {
  it("pre-fills the difficulty select from the trip", () => {
    render(<EditTripForm trip={TRIP} />)
    expect(screen.getByRole("combobox", { name: /difficulty/i })).toHaveValue("moderate")
  })

  it("shows 'Not set' as an option when the trip has no difficulty", () => {
    render(<EditTripForm trip={{ ...TRIP, difficulty: null }} />)
    expect(screen.getByRole("combobox", { name: /difficulty/i })).toHaveValue("")
  })

  it("includes difficulty in the update payload on submit", async () => {
    mockUpdateTrip.mockResolvedValue({ success: true })
    render(<EditTripForm trip={TRIP} />)
    await userEvent.selectOptions(screen.getByRole("combobox", { name: /difficulty/i }), "expert")
    await userEvent.click(screen.getByRole("button", { name: /save changes/i }))
    expect(mockUpdateTrip).toHaveBeenCalledWith(
      TRIP.id,
      expect.objectContaining({ difficulty: "expert" }),
    )
  })
})
