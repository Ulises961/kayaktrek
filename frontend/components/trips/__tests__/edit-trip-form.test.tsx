import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { EditTripForm } from "../edit-trip-form"
import type { Trip } from "@/lib/dtos/trip"

const { mockUpdateTrip } = vi.hoisted(() => ({
  mockUpdateTrip: vi.fn(),
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

const noop = () => {}

describe("EditTripForm — difficulty field", () => {
  it("pre-fills the difficulty select from the trip", () => {
    render(<EditTripForm trip={TRIP} onSuccess={noop} onCancel={noop} />)
    expect(screen.getByRole("combobox", { name: /difficulty/i })).toHaveValue("moderate")
  })

  it("shows 'Not set' as an option when the trip has no difficulty", () => {
    render(<EditTripForm trip={{ ...TRIP, difficulty: null }} onSuccess={noop} onCancel={noop} />)
    expect(screen.getByRole("combobox", { name: /difficulty/i })).toHaveValue("")
  })

  it("includes difficulty in the update payload on submit", async () => {
    mockUpdateTrip.mockResolvedValue({ success: true })
    render(<EditTripForm trip={TRIP} onSuccess={noop} onCancel={noop} />)
    await userEvent.selectOptions(screen.getByRole("combobox", { name: /difficulty/i }), "expert")
    await userEvent.click(screen.getByRole("button", { name: /save changes/i }))
    expect(mockUpdateTrip).toHaveBeenCalledWith(
      TRIP.id,
      expect.objectContaining({ difficulty: "expert" }),
    )
  })
})

describe("EditTripForm — dialog callbacks", () => {
  it("calls onSuccess after a successful save", async () => {
    mockUpdateTrip.mockResolvedValue({ success: true })
    const onSuccess = vi.fn()
    render(<EditTripForm trip={TRIP} onSuccess={onSuccess} onCancel={noop} />)
    await userEvent.click(screen.getByRole("button", { name: /save changes/i }))
    await vi.waitFor(() => expect(onSuccess).toHaveBeenCalled())
  })

  it("does not call onSuccess when the save fails", async () => {
    mockUpdateTrip.mockResolvedValue({ success: false, error: "Server error." })
    const onSuccess = vi.fn()
    render(<EditTripForm trip={TRIP} onSuccess={onSuccess} onCancel={noop} />)
    await userEvent.click(screen.getByRole("button", { name: /save changes/i }))
    await screen.findByText("Server error.")
    expect(onSuccess).not.toHaveBeenCalled()
  })

  it("calls onCancel when Cancel is clicked", async () => {
    const onCancel = vi.fn()
    render(<EditTripForm trip={TRIP} onSuccess={noop} onCancel={onCancel} />)
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }))
    expect(onCancel).toHaveBeenCalled()
  })
})
