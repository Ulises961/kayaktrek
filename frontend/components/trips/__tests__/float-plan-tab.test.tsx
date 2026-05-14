import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

vi.mock("@/lib/trip-member/actions", () => ({
  updateMyFloatPlan: vi.fn(),
  shareMedicalNotes: vi.fn(),
}))
vi.mock("@/lib/profile/actions", () => ({
  reAuth: vi.fn(),
  getMedicalNotes: vi.fn(),
}))

import { updateMyFloatPlan } from "@/lib/trip-member/actions"
import { FloatPlanTab } from "../tabs/float-plan-tab"
import type { TripMember } from "@/lib/dtos/trip-member"

const TRIP_ID = "01952f1a-0000-7000-8000-000000000001"

const BASE_MEMBER: TripMember = {
  id: "01952f1a-0000-7000-8000-000000000010",
  role: "crew",
  user: { id: "01952f1a-0000-7000-8000-000000000001", mail: "ada@example.com", username: "ada", name: "Ada" },
  vesselMake: "Wilderness Systems",
  vesselModel: "Tempest 170",
  vesselLengthCm: 520,
  vesselColorPrimary: "Red",
  vesselColorSecondary: "White",
  emergencyContactName: "Bob Smith",
  emergencyContactPhone: "+1555555555",
  emergencyContactRelationship: "Partner",
  medicalNotes: null,
  medicalNotesConsentAt: null,
  floatPlanConfirmedAt: null,
}

beforeEach(() => vi.clearAllMocks())

describe("FloatPlanTab", () => {
  it("shows amber banner when floatPlanConfirmedAt is null", () => {
    render(<FloatPlanTab tripId={TRIP_ID} currentMember={BASE_MEMBER} />)
    expect(screen.getByText(/review.*float plan/i)).toBeDefined()
  })

  it("does not show amber banner when floatPlanConfirmedAt is set", () => {
    const member = { ...BASE_MEMBER, floatPlanConfirmedAt: "2026-05-14T10:00:00" }
    render(<FloatPlanTab tripId={TRIP_ID} currentMember={member} />)
    expect(screen.queryByText(/review.*float plan/i)).toBeNull()
  })

  it("pre-fills vessel make from currentMember", () => {
    render(<FloatPlanTab tripId={TRIP_ID} currentMember={BASE_MEMBER} />)
    const input = screen.getByLabelText(/make/i) as HTMLInputElement
    expect(input.value).toBe("Wilderness Systems")
  })

  it("pre-fills emergency contact name from currentMember", () => {
    render(<FloatPlanTab tripId={TRIP_ID} currentMember={BASE_MEMBER} />)
    const input = screen.getByLabelText(/^name$/i) as HTMLInputElement
    expect(input.value).toBe("Bob Smith")
  })

  it("calls updateMyFloatPlan with tripId and form values on submit", async () => {
    vi.mocked(updateMyFloatPlan).mockResolvedValue({ success: true })
    render(<FloatPlanTab tripId={TRIP_ID} currentMember={BASE_MEMBER} />)
    await userEvent.click(screen.getByRole("button", { name: /save float plan/i }))
    await waitFor(() =>
      expect(updateMyFloatPlan).toHaveBeenCalledWith(
        TRIP_ID,
        expect.objectContaining({ vesselMake: "Wilderness Systems" })
      )
    )
  })

  it("shows saved confirmation after successful save", async () => {
    vi.mocked(updateMyFloatPlan).mockResolvedValue({ success: true })
    render(<FloatPlanTab tripId={TRIP_ID} currentMember={BASE_MEMBER} />)
    await userEvent.click(screen.getByRole("button", { name: /save float plan/i }))
    await waitFor(() => expect(screen.getByText(/saved/i)).toBeDefined())
  })

  it("shows error message when save fails", async () => {
    vi.mocked(updateMyFloatPlan).mockResolvedValue({ success: false, error: "Failed to update float plan." })
    render(<FloatPlanTab tripId={TRIP_ID} currentMember={BASE_MEMBER} />)
    await userEvent.click(screen.getByRole("button", { name: /save float plan/i }))
    await waitFor(() => expect(screen.getByText("Failed to update float plan.")).toBeDefined())
  })
})
