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
  grantMedicalConsent: vi.fn(),
  revokeMedicalConsent: vi.fn(),
}))

import { updateMyFloatPlan } from "@/lib/trip-member/actions"
import { FloatPlanTab } from "../tabs/float-plan-tab"
import type { TripMember } from "@/lib/dtos/trip-member"

const TRIP_ID = "01952f1a-0000-7000-8000-000000000001"

const BASE_MEMBER: TripMember = {
  id: "01952f1a-0000-7000-8000-000000000010",
  role: "crew",
  user: {
    id: "01952f1a-0000-7000-8000-000000000001",
    mail: "ada@example.com",
    username: "ada",
    name: "Ada",
  },
  vesselMake: "Wilderness Systems",
  vesselModel: "Tempest 170",
  vesselLengthCm: 520,
  vesselColorPrimary: "Red",
  vesselColorSecondary: "White",
  emergencyContactName: "Bob Smith",
  emergencyContactPhone: "+1555555555",
  emergencyContactRelationship: "Partner",
  medicalNotesConsentAt: null,
  floatPlanConfirmedAt: null,
}

beforeEach(() => vi.clearAllMocks())

describe("FloatPlanTab — viewing state", () => {
  it("shows amber banner when floatPlanConfirmedAt is null", () => {
    render(<FloatPlanTab tripId={TRIP_ID} currentMember={BASE_MEMBER} />)
    expect(screen.getByText(/review.*float plan/i)).toBeDefined()
  })

  it("does not show amber banner when floatPlanConfirmedAt is set", () => {
    const member = { ...BASE_MEMBER, floatPlanConfirmedAt: "2026-05-14T10:00:00" }
    render(<FloatPlanTab tripId={TRIP_ID} currentMember={member} />)
    expect(screen.queryByText(/review.*float plan/i)).toBeNull()
  })

  it("shows vessel make and model in read-only view", () => {
    render(<FloatPlanTab tripId={TRIP_ID} currentMember={BASE_MEMBER} />)
    expect(screen.getByText("Wilderness Systems Tempest 170")).toBeDefined()
  })

  it("shows emergency contact name in read-only view", () => {
    render(<FloatPlanTab tripId={TRIP_ID} currentMember={BASE_MEMBER} />)
    expect(screen.getByText("Bob Smith")).toBeDefined()
  })

  it("does not show form inputs by default", () => {
    render(<FloatPlanTab tripId={TRIP_ID} currentMember={BASE_MEMBER} />)
    expect(screen.queryByLabelText(/make/i)).toBeNull()
  })

  it("shows an Edit button", () => {
    render(<FloatPlanTab tripId={TRIP_ID} currentMember={BASE_MEMBER} />)
    expect(screen.getByRole("button", { name: /edit/i })).toBeDefined()
  })
})

describe("FloatPlanTab — editing state", () => {
  it("shows form inputs after clicking Edit", async () => {
    render(<FloatPlanTab tripId={TRIP_ID} currentMember={BASE_MEMBER} />)
    await userEvent.click(screen.getByRole("button", { name: /edit/i }))
    expect(screen.getByLabelText(/make/i)).toBeDefined()
    expect((screen.getByLabelText(/make/i) as HTMLInputElement).value).toBe("Wilderness Systems")
  })

  it("returns to read-only on Cancel", async () => {
    render(<FloatPlanTab tripId={TRIP_ID} currentMember={BASE_MEMBER} />)
    await userEvent.click(screen.getByRole("button", { name: /edit/i }))
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }))
    expect(screen.queryByLabelText(/make/i)).toBeNull()
    expect(screen.getByText("Wilderness Systems Tempest 170")).toBeDefined()
  })

  it("calls updateMyFloatPlan and returns to read-only on Save", async () => {
    vi.mocked(updateMyFloatPlan).mockResolvedValue({ success: true })
    render(<FloatPlanTab tripId={TRIP_ID} currentMember={BASE_MEMBER} />)
    await userEvent.click(screen.getByRole("button", { name: /edit/i }))
    await userEvent.click(screen.getByRole("button", { name: /save float plan/i }))
    await waitFor(() =>
      expect(updateMyFloatPlan).toHaveBeenCalledWith(
        TRIP_ID,
        expect.objectContaining({ vesselMake: "Wilderness Systems" }),
      ),
    )
    await waitFor(() => expect(screen.queryByLabelText(/make/i)).toBeNull())
  })

  it("shows error and stays in editing on save failure", async () => {
    vi.mocked(updateMyFloatPlan).mockResolvedValue({
      success: false,
      error: "Failed to update float plan.",
    })
    render(<FloatPlanTab tripId={TRIP_ID} currentMember={BASE_MEMBER} />)
    await userEvent.click(screen.getByRole("button", { name: /edit/i }))
    await userEvent.click(screen.getByRole("button", { name: /save float plan/i }))
    await waitFor(() => expect(screen.getByText("Failed to update float plan.")).toBeDefined())
    expect(screen.getByLabelText(/make/i)).toBeDefined()
  })
})
