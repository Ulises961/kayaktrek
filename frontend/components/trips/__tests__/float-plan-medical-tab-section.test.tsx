import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

vi.mock("@/lib/profile/actions", () => ({
  reAuth: vi.fn(),
  getMedicalNotes: vi.fn(),
  grantMedicalConsent: vi.fn(),
  revokeMedicalConsent: vi.fn(),
}))
vi.mock("@/lib/trip-member/actions", () => ({
  updateMyFloatPlan: vi.fn(),
  shareMedicalNotes: vi.fn(),
}))

import { reAuth, getMedicalNotes, grantMedicalConsent, revokeMedicalConsent } from "@/lib/profile/actions"
import { shareMedicalNotes } from "@/lib/trip-member/actions"
import { FloatPlanMedicalTabSection } from "../float-plan-medical-tab-section"

const TRIP_ID = "01952f1a-0000-7000-8000-000000000001"
const ELEVATED_TOKEN = "eyJ.elevated.token"
const PASSWORD = "MyPass1!"

beforeEach(() => vi.clearAllMocks())

async function openToEdit(hasStoredNotes = false) {
  vi.mocked(reAuth).mockResolvedValue({ success: true, elevatedToken: ELEVATED_TOKEN })
  vi.mocked(getMedicalNotes).mockResolvedValue({
    success: true,
    notes: hasStoredNotes ? "Allergic to penicillin" : null,
  })
  await userEvent.click(screen.getByRole("button", { name: hasStoredNotes ? /edit/i : /add notes/i }))
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

describe("FloatPlanMedicalTabSection — editing state", () => {
  it("shows a Save button in the editing phase", async () => {
    render(<FloatPlanMedicalTabSection tripId={TRIP_ID} hasStoredNotes={false} sharedAt={null} />)
    await openToEdit(false)
    expect(screen.getByRole("button", { name: /^save$/i })).toBeDefined()
  })

  it("calls grantMedicalConsent with token, notes, and password on Save", async () => {
    vi.mocked(grantMedicalConsent).mockResolvedValue({ success: true })
    render(<FloatPlanMedicalTabSection tripId={TRIP_ID} hasStoredNotes={false} sharedAt={null} />)
    await openToEdit(false)
    await userEvent.type(screen.getByRole("textbox"), "Blood type A+")
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }))
    await waitFor(() =>
      expect(grantMedicalConsent).toHaveBeenCalledWith(ELEVATED_TOKEN, "Blood type A+", PASSWORD)
    )
  })

  it("shows saved confirmation after Save", async () => {
    vi.mocked(grantMedicalConsent).mockResolvedValue({ success: true })
    render(<FloatPlanMedicalTabSection tripId={TRIP_ID} hasStoredNotes={true} sharedAt={null} />)
    await openToEdit(true)
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }))
    await waitFor(() => expect(screen.getByText(/saved/i)).toBeDefined())
  })

  it("shows Delete button when notes are already stored", async () => {
    render(<FloatPlanMedicalTabSection tripId={TRIP_ID} hasStoredNotes={true} sharedAt={null} />)
    await openToEdit(true)
    expect(screen.getByRole("button", { name: /delete/i })).toBeDefined()
  })

  it("does not show Delete button when no notes are stored", async () => {
    render(<FloatPlanMedicalTabSection tripId={TRIP_ID} hasStoredNotes={false} sharedAt={null} />)
    await openToEdit(false)
    expect(screen.queryByRole("button", { name: /delete/i })).toBeNull()
  })

  it("calls revokeMedicalConsent and returns to idle on Delete", async () => {
    vi.mocked(revokeMedicalConsent).mockResolvedValue({ success: true })
    render(<FloatPlanMedicalTabSection tripId={TRIP_ID} hasStoredNotes={true} sharedAt={null} />)
    await openToEdit(true)
    await userEvent.click(screen.getByRole("button", { name: /delete/i }))
    await waitFor(() => expect(revokeMedicalConsent).toHaveBeenCalledWith(ELEVATED_TOKEN))
    expect(screen.getByRole("button", { name: /add notes/i })).toBeDefined()
  })

  it("shows a Share with trip leader button", async () => {
    render(<FloatPlanMedicalTabSection tripId={TRIP_ID} hasStoredNotes={true} sharedAt={null} />)
    await openToEdit(true)
    expect(screen.getByRole("button", { name: /share with.*leader/i })).toBeDefined()
  })

  it("calls shareMedicalNotes with tripId, token, and password when Share is clicked", async () => {
    vi.mocked(shareMedicalNotes).mockResolvedValue({ success: true })
    render(<FloatPlanMedicalTabSection tripId={TRIP_ID} hasStoredNotes={true} sharedAt={null} />)
    await openToEdit(true)
    await userEvent.click(screen.getByRole("button", { name: /share with.*leader/i }))
    await waitFor(() =>
      expect(shareMedicalNotes).toHaveBeenCalledWith(TRIP_ID, ELEVATED_TOKEN, PASSWORD)
    )
  })

  it("shows shared confirmation after successful share", async () => {
    vi.mocked(shareMedicalNotes).mockResolvedValue({ success: true })
    render(<FloatPlanMedicalTabSection tripId={TRIP_ID} hasStoredNotes={true} sharedAt={null} />)
    await openToEdit(true)
    await userEvent.click(screen.getByRole("button", { name: /share with.*leader/i }))
    await waitFor(() => expect(screen.getByText(/shared with.*leader/i)).toBeDefined())
  })

  it("shows error when share fails", async () => {
    vi.mocked(shareMedicalNotes).mockResolvedValue({ success: false, error: "Session expired. Please try again." })
    render(<FloatPlanMedicalTabSection tripId={TRIP_ID} hasStoredNotes={true} sharedAt={null} />)
    await openToEdit(true)
    await userEvent.click(screen.getByRole("button", { name: /share with.*leader/i }))
    await waitFor(() => expect(screen.getByText("Session expired. Please try again.")).toBeDefined())
  })
})
