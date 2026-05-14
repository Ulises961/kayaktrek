import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

vi.mock("@/lib/profile/actions", () => ({
  reAuth: vi.fn(),
  getMedicalNotes: vi.fn(),
}))
vi.mock("@/lib/trip-member/actions", () => ({
  updateMyFloatPlan: vi.fn(),
  getTripMedicalNotes: vi.fn(),
  setTripMedicalNotes: vi.fn(),
  revokeTripMedicalNotes: vi.fn(),
  shareMedicalNotes: vi.fn(),
}))

import { reAuth, getMedicalNotes } from "@/lib/profile/actions"
import { getTripMedicalNotes, setTripMedicalNotes, revokeTripMedicalNotes, shareMedicalNotes } from "@/lib/trip-member/actions"
import { FloatPlanMedicalTabSection } from "../float-plan-medical-tab-section"

const TRIP_ID = "01952f1a-0000-7000-8000-000000000001"
const ELEVATED_TOKEN = "eyJ.elevated.token"
const PASSWORD = "MyPass1!"

beforeEach(() => vi.clearAllMocks())

// Helper: authenticate and reach the editing phase.
// - hasStoredTripNotes: whether TripMember already has encrypted notes
// - profileNotes: if truthy and no trip notes, the profile seed value
async function openToEdit({
  hasStoredTripNotes = false,
  profileNotes = null as string | null,
} = {}) {
  vi.mocked(reAuth).mockResolvedValue({ success: true, elevatedToken: ELEVATED_TOKEN })
  vi.mocked(getTripMedicalNotes).mockResolvedValue({
    success: true,
    notes: hasStoredTripNotes ? "Allergic to penicillin" : null,
  })
  vi.mocked(getMedicalNotes).mockResolvedValue({
    success: true,
    notes: profileNotes,
  })

  const btnName = hasStoredTripNotes ? /edit/i : /add notes/i
  await userEvent.click(screen.getByRole("button", { name: btnName }))
  await userEvent.type(screen.getByLabelText(/password/i), PASSWORD)
  await userEvent.click(screen.getByRole("button", { name: /continue/i }))
  await waitFor(() => expect(screen.getByRole("textbox")).toBeDefined())
}

describe("FloatPlanMedicalTabSection — idle state", () => {
  it("shows no notes status and Add notes button when no notes stored", () => {
    render(<FloatPlanMedicalTabSection tripId={TRIP_ID} hasStoredNotes={false} sharedAt={null} />)
    expect(screen.getByText(/no notes stored/i)).toBeDefined()
    expect(screen.getByRole("button", { name: /add notes/i })).toBeDefined()
  })

  it("shows notes stored status and Edit button when notes exist", () => {
    render(<FloatPlanMedicalTabSection tripId={TRIP_ID} hasStoredNotes={true} sharedAt={null} />)
    expect(screen.getByText(/notes stored/i)).toBeDefined()
    expect(screen.getByRole("button", { name: /edit/i })).toBeDefined()
  })

  it("shows not shared indicator when sharedAt is null and notes exist", () => {
    render(<FloatPlanMedicalTabSection tripId={TRIP_ID} hasStoredNotes={true} sharedAt={null} />)
    expect(screen.getByText(/not shared/i)).toBeDefined()
  })

  it("shows shared indicator when sharedAt is set", () => {
    render(<FloatPlanMedicalTabSection tripId={TRIP_ID} hasStoredNotes={true} sharedAt="2026-05-14T10:00:00" />)
    expect(screen.getByText(/shared with.*leader/i)).toBeDefined()
  })
})

describe("FloatPlanMedicalTabSection — authenticating state", () => {
  it("shows password field and Continue after clicking Edit", async () => {
    render(<FloatPlanMedicalTabSection tripId={TRIP_ID} hasStoredNotes={true} sharedAt={null} />)
    await userEvent.click(screen.getByRole("button", { name: /edit/i }))
    expect(screen.getByLabelText(/password/i)).toBeDefined()
    expect(screen.getByRole("button", { name: /continue/i })).toBeDefined()
  })

  it("returns to idle on Cancel", async () => {
    render(<FloatPlanMedicalTabSection tripId={TRIP_ID} hasStoredNotes={true} sharedAt={null} />)
    await userEvent.click(screen.getByRole("button", { name: /edit/i }))
    await userEvent.click(screen.getByText(/cancel/i))
    expect(screen.getByRole("button", { name: /edit/i })).toBeDefined()
    expect(screen.queryByLabelText(/password/i)).toBeNull()
  })

  it("shows error when reAuth fails", async () => {
    vi.mocked(reAuth).mockResolvedValue({ success: false, error: "Password incorrect." })
    render(<FloatPlanMedicalTabSection tripId={TRIP_ID} hasStoredNotes={false} sharedAt={null} />)
    await userEvent.click(screen.getByRole("button", { name: /add notes/i }))
    await userEvent.type(screen.getByLabelText(/password/i), "wrong")
    await userEvent.click(screen.getByRole("button", { name: /continue/i }))
    await waitFor(() => expect(screen.getByText("Password incorrect.")).toBeDefined())
  })
})

describe("FloatPlanMedicalTabSection — editing state, note loading", () => {
  it("pre-fills existing trip notes into the textarea", async () => {
    render(<FloatPlanMedicalTabSection tripId={TRIP_ID} hasStoredNotes={true} sharedAt={null} />)
    await openToEdit({ hasStoredTripNotes: true })
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("Allergic to penicillin")
  })

  it("seeds from profile notes when no trip notes exist", async () => {
    render(<FloatPlanMedicalTabSection tripId={TRIP_ID} hasStoredNotes={false} sharedAt={null} />)
    await openToEdit({ hasStoredTripNotes: false, profileNotes: "Profile blood type O+" })
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("Profile blood type O+")
  })

  it("shows empty textarea when no trip notes and no profile notes", async () => {
    render(<FloatPlanMedicalTabSection tripId={TRIP_ID} hasStoredNotes={false} sharedAt={null} />)
    await openToEdit({ hasStoredTripNotes: false, profileNotes: null })
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("")
  })
})

describe("FloatPlanMedicalTabSection — editing state, save / delete / share", () => {
  it("shows a Save button in the editing phase", async () => {
    render(<FloatPlanMedicalTabSection tripId={TRIP_ID} hasStoredNotes={false} sharedAt={null} />)
    await openToEdit()
    expect(screen.getByRole("button", { name: /^save$/i })).toBeDefined()
  })

  it("calls setTripMedicalNotes with tripId, notes, token, and password on Save", async () => {
    vi.mocked(setTripMedicalNotes).mockResolvedValue({ success: true })
    render(<FloatPlanMedicalTabSection tripId={TRIP_ID} hasStoredNotes={false} sharedAt={null} />)
    await openToEdit()
    await userEvent.type(screen.getByRole("textbox"), "Blood type A+")
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }))
    await waitFor(() =>
      expect(setTripMedicalNotes).toHaveBeenCalledWith(TRIP_ID, "Blood type A+", ELEVATED_TOKEN, PASSWORD)
    )
  })

  it("shows saved confirmation after Save", async () => {
    vi.mocked(setTripMedicalNotes).mockResolvedValue({ success: true })
    render(<FloatPlanMedicalTabSection tripId={TRIP_ID} hasStoredNotes={true} sharedAt={null} />)
    await openToEdit({ hasStoredTripNotes: true })
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }))
    await waitFor(() => expect(screen.getByText(/saved/i)).toBeDefined())
  })

  it("shows Delete button when notes are already stored", async () => {
    render(<FloatPlanMedicalTabSection tripId={TRIP_ID} hasStoredNotes={true} sharedAt={null} />)
    await openToEdit({ hasStoredTripNotes: true })
    expect(screen.getByRole("button", { name: /delete/i })).toBeDefined()
  })

  it("does not show Delete button when no notes are stored", async () => {
    render(<FloatPlanMedicalTabSection tripId={TRIP_ID} hasStoredNotes={false} sharedAt={null} />)
    await openToEdit({ hasStoredTripNotes: false })
    expect(screen.queryByRole("button", { name: /delete/i })).toBeNull()
  })

  it("calls revokeTripMedicalNotes and returns to idle on Delete", async () => {
    vi.mocked(revokeTripMedicalNotes).mockResolvedValue({ success: true })
    render(<FloatPlanMedicalTabSection tripId={TRIP_ID} hasStoredNotes={true} sharedAt={null} />)
    await openToEdit({ hasStoredTripNotes: true })
    await userEvent.click(screen.getByRole("button", { name: /delete/i }))
    await waitFor(() => expect(revokeTripMedicalNotes).toHaveBeenCalledWith(TRIP_ID, ELEVATED_TOKEN))
    expect(screen.getByRole("button", { name: /add notes/i })).toBeDefined()
  })

  it("shows a Share with trip leader button", async () => {
    render(<FloatPlanMedicalTabSection tripId={TRIP_ID} hasStoredNotes={true} sharedAt={null} />)
    await openToEdit({ hasStoredTripNotes: true })
    expect(screen.getByRole("button", { name: /share with.*leader/i })).toBeDefined()
  })

  it("calls shareMedicalNotes with tripId, token, and password when Share is clicked", async () => {
    vi.mocked(shareMedicalNotes).mockResolvedValue({ success: true })
    render(<FloatPlanMedicalTabSection tripId={TRIP_ID} hasStoredNotes={true} sharedAt={null} />)
    await openToEdit({ hasStoredTripNotes: true })
    await userEvent.click(screen.getByRole("button", { name: /share with.*leader/i }))
    await waitFor(() =>
      expect(shareMedicalNotes).toHaveBeenCalledWith(TRIP_ID, ELEVATED_TOKEN, PASSWORD)
    )
  })

  it("shows shared confirmation after successful share", async () => {
    vi.mocked(shareMedicalNotes).mockResolvedValue({ success: true })
    render(<FloatPlanMedicalTabSection tripId={TRIP_ID} hasStoredNotes={true} sharedAt={null} />)
    await openToEdit({ hasStoredTripNotes: true })
    await userEvent.click(screen.getByRole("button", { name: /share with.*leader/i }))
    await waitFor(() => expect(screen.getByText(/shared with.*leader/i)).toBeDefined())
  })

  it("shows error when share fails", async () => {
    vi.mocked(shareMedicalNotes).mockResolvedValue({ success: false, error: "Session expired. Please try again." })
    render(<FloatPlanMedicalTabSection tripId={TRIP_ID} hasStoredNotes={true} sharedAt={null} />)
    await openToEdit({ hasStoredTripNotes: true })
    await userEvent.click(screen.getByRole("button", { name: /share with.*leader/i }))
    await waitFor(() => expect(screen.getByText("Session expired. Please try again.")).toBeDefined())
  })
})
