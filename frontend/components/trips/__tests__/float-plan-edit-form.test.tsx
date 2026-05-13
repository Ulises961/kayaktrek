import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

vi.mock("@/lib/trip-member/actions", () => ({
  updateMyFloatPlan: vi.fn(),
}))
vi.mock("next/navigation", () => ({ useRouter: vi.fn() }))

import { updateMyFloatPlan } from "@/lib/trip-member/actions"
import { useRouter } from "next/navigation"
import { FloatPlanEditForm } from "../float-plan-edit-form"
import type { TripMember } from "@/lib/dtos/trip-member"

const mockPush = vi.fn()

const MEMBER: TripMember = {
  id: "01952f1a-0000-7000-8000-000000000020",
  role: "crew",
  user: { id: "01952f1a-0000-7000-8000-000000000001", mail: "ada@example.com", username: "ada", name: "Ada" },
  vesselMake: "Wilderness Systems",
  vesselModel: "Tempest 170",
  vesselLengthCm: 518,
  vesselColorPrimary: "Red",
  vesselColorSecondary: null,
  emergencyContactName: "Grace Hopper",
  emergencyContactPhone: "+34600000002",
  emergencyContactRelationship: "Partner",
}

const TRIP_ID = "01952f1a-0000-7000-8000-000000000010"

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(useRouter).mockReturnValue({ push: mockPush } as ReturnType<typeof useRouter>)
})

describe("FloatPlanEditForm", () => {
  it("pre-fills vessel fields from the membership", () => {
    render(<FloatPlanEditForm tripId={TRIP_ID} membership={MEMBER} />)
    expect((screen.getByLabelText(/make/i) as HTMLInputElement).value).toBe("Wilderness Systems")
    expect((screen.getByLabelText(/model/i) as HTMLInputElement).value).toBe("Tempest 170")
  })

  it("pre-fills emergency contact fields from the membership", () => {
    render(<FloatPlanEditForm tripId={TRIP_ID} membership={MEMBER} />)
    expect((screen.getByLabelText(/contact name/i) as HTMLInputElement).value).toBe("Grace Hopper")
    expect((screen.getByLabelText(/contact phone/i) as HTMLInputElement).value).toBe("+34600000002")
  })

  it("calls updateMyFloatPlan with tripId and form values on submit", async () => {
    vi.mocked(updateMyFloatPlan).mockResolvedValue({ success: true })
    render(<FloatPlanEditForm tripId={TRIP_ID} membership={MEMBER} />)
    await userEvent.click(screen.getByRole("button", { name: /save/i }))
    await waitFor(() =>
      expect(updateMyFloatPlan).toHaveBeenCalledWith(TRIP_ID, expect.objectContaining({ vesselMake: "Wilderness Systems" }))
    )
  })

  it("redirects to the trip crew tab after a successful save", async () => {
    vi.mocked(updateMyFloatPlan).mockResolvedValue({ success: true })
    render(<FloatPlanEditForm tripId={TRIP_ID} membership={MEMBER} />)
    await userEvent.click(screen.getByRole("button", { name: /save/i }))
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith(`/trips/${TRIP_ID}?tab=crew`))
  })

  it("shows an error message when the save fails", async () => {
    vi.mocked(updateMyFloatPlan).mockResolvedValue({ success: false, error: "Server error." })
    render(<FloatPlanEditForm tripId={TRIP_ID} membership={MEMBER} />)
    await userEvent.click(screen.getByRole("button", { name: /save/i }))
    await waitFor(() => expect(screen.getByText("Server error.")).toBeDefined())
  })
})
