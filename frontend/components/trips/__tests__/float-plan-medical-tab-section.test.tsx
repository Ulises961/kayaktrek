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
  getLeaderPublicKey: vi.fn(),
  shareMedicalNotes: vi.fn(),
}))
// Mocked for the same reason as in medical-notes-section.test.tsx: these tests are about
// phases and error states, and the crypto is pinned by the cross-language vectors.
vi.mock("@/lib/crypto/medical", () => ({
  encrypt: vi.fn(),
  decrypt: vi.fn(),
  encryptForRecipient: vi.fn(),
}))

import { reAuth, getMedicalNotes } from "@/lib/profile/actions"
import {
  getTripMedicalNotes,
  setTripMedicalNotes,
  revokeTripMedicalNotes,
  getLeaderPublicKey,
  shareMedicalNotes,
} from "@/lib/trip-member/actions"
import { encrypt, decrypt, encryptForRecipient } from "@/lib/crypto/medical"
import { FloatPlanMedicalTabSection } from "../float-plan-medical-tab-section"

const TRIP_ID = "01952f1a-0000-7000-8000-000000000001"
const ELEVATED_TOKEN = "eyJ.elevated.token"
const PASSWORD = "MyPass1!"
const SEALED = { ciphertext: "Y3Q=", nonce: "bm9uY2U=", salt: "c2FsdA==" }
const LEADER_PUBLIC_KEY = "cGs="
const SEALED_FOR_LEADER = {
  ciphertext: "bGVhZGVyLWN0",
  nonce: "bGVhZGVyLW5vbmNl",
  ephemeralPublicKey: "ZXBo",
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(encrypt).mockResolvedValue(SEALED)
  vi.mocked(encryptForRecipient).mockReturnValue(SEALED_FOR_LEADER)
  vi.mocked(getLeaderPublicKey).mockResolvedValue({
    success: true,
    publicKey: LEADER_PUBLIC_KEY,
  })
})

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
    sealed: hasStoredTripNotes ? SEALED : null,
  })
  vi.mocked(getMedicalNotes).mockResolvedValue({
    success: true,
    sealed: profileNotes ? SEALED : null,
  })
  vi.mocked(decrypt).mockResolvedValue(
    hasStoredTripNotes ? "Allergic to penicillin" : (profileNotes ?? ""),
  )

  const btnName = hasStoredTripNotes ? /edit/i : /add notes/i
  await userEvent.click(screen.getByRole("button", { name: btnName }))
  await userEvent.type(screen.getByLabelText(/password/i, { selector: "input" }), PASSWORD)
  await userEvent.click(screen.getByRole("button", { name: /continue/i }))
  await waitFor(() => expect(screen.getByRole("button", { name: /^save$/i })).toBeDefined())
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
    render(
      <FloatPlanMedicalTabSection
        tripId={TRIP_ID}
        hasStoredNotes={true}
        sharedAt="2026-05-14T10:00:00"
      />,
    )
    expect(screen.getByText(/shared with.*leader/i)).toBeDefined()
  })
})

describe("FloatPlanMedicalTabSection — authenticating state", () => {
  it("shows password field and Continue after clicking Edit", async () => {
    render(<FloatPlanMedicalTabSection tripId={TRIP_ID} hasStoredNotes={true} sharedAt={null} />)
    await userEvent.click(screen.getByRole("button", { name: /edit/i }))
    expect(screen.getByLabelText(/password/i, { selector: "input" })).toBeDefined()
    expect(screen.getByRole("button", { name: /continue/i })).toBeDefined()
  })

  it("returns to idle on Cancel", async () => {
    render(<FloatPlanMedicalTabSection tripId={TRIP_ID} hasStoredNotes={true} sharedAt={null} />)
    await userEvent.click(screen.getByRole("button", { name: /edit/i }))
    await userEvent.click(screen.getByText(/cancel/i))
    expect(screen.getByRole("button", { name: /edit/i })).toBeDefined()
    expect(screen.queryByLabelText(/password/i, { selector: "input" })).toBeNull()
  })

  it("shows error when reAuth fails", async () => {
    vi.mocked(reAuth).mockResolvedValue({ success: false, error: "Password incorrect." })
    render(<FloatPlanMedicalTabSection tripId={TRIP_ID} hasStoredNotes={false} sharedAt={null} />)
    await userEvent.click(screen.getByRole("button", { name: /add notes/i }))
    await userEvent.type(screen.getByLabelText(/password/i, { selector: "input" }), "wrong")
    await userEvent.click(screen.getByRole("button", { name: /continue/i }))
    await waitFor(() => expect(screen.getByText("Password incorrect.")).toBeDefined())
  })

  it("shows error and stays on the password step when the trip-notes fetch fails", async () => {
    vi.mocked(reAuth).mockResolvedValue({ success: true, elevatedToken: ELEVATED_TOKEN })
    vi.mocked(getTripMedicalNotes).mockResolvedValue({
      success: false,
      error: "Session expired.",
    })
    render(<FloatPlanMedicalTabSection tripId={TRIP_ID} hasStoredNotes={true} sharedAt={null} />)
    await userEvent.click(screen.getByRole("button", { name: /edit/i }))
    await userEvent.type(screen.getByLabelText(/password/i, { selector: "input" }), PASSWORD)
    await userEvent.click(screen.getByRole("button", { name: /continue/i }))

    await waitFor(() => expect(screen.getByText("Session expired.")).toBeDefined())
    // Never reached the editing phase — no textarea, password field still present.
    expect(screen.queryByRole("textbox")).toBeNull()
    expect(screen.getByLabelText(/password/i, { selector: "input" })).toBeInTheDocument()
  })
})

describe("FloatPlanMedicalTabSection — editing state, note loading", () => {
  it("pre-fills existing trip notes into the textarea", async () => {
    render(<FloatPlanMedicalTabSection tripId={TRIP_ID} hasStoredNotes={true} sharedAt={null} />)
    await openToEdit({ hasStoredTripNotes: true })
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe(
      "Allergic to penicillin",
    )
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

  it("seals the notes in the browser and sends only the ciphertext on Save", async () => {
    vi.mocked(setTripMedicalNotes).mockResolvedValue({ success: true })
    render(<FloatPlanMedicalTabSection tripId={TRIP_ID} hasStoredNotes={false} sharedAt={null} />)
    await openToEdit()
    await userEvent.type(screen.getByRole("textbox"), "Blood type A+")
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }))
    await waitFor(() => expect(encrypt).toHaveBeenCalledWith("Blood type A+", PASSWORD))
    expect(setTripMedicalNotes).toHaveBeenCalledWith(TRIP_ID, ELEVATED_TOKEN, SEALED)
  })

  it("shows saved confirmation after Save", async () => {
    vi.mocked(setTripMedicalNotes).mockResolvedValue({ success: true })
    render(<FloatPlanMedicalTabSection tripId={TRIP_ID} hasStoredNotes={true} sharedAt={null} />)
    await openToEdit({ hasStoredTripNotes: true })
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }))
    await waitFor(() => expect(screen.getByText(/saved/i)).toBeDefined())
  })

  it("shows error and stays in editing without confirming when Save fails", async () => {
    vi.mocked(setTripMedicalNotes).mockResolvedValue({
      success: false,
      error: "Encryption key unavailable.",
    })
    render(<FloatPlanMedicalTabSection tripId={TRIP_ID} hasStoredNotes={false} sharedAt={null} />)
    await openToEdit()
    await userEvent.type(screen.getByRole("textbox"), "Blood type A+")
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }))

    await waitFor(() => expect(screen.getByText("Encryption key unavailable.")).toBeDefined())
    expect(screen.queryByText(/^saved\.$/i)).toBeNull()
    // Still in the editing phase with the typed notes intact, not reverted to idle.
    expect(screen.getByRole("button", { name: /^save$/i })).toBeInTheDocument()
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
    await waitFor(() =>
      expect(revokeTripMedicalNotes).toHaveBeenCalledWith(TRIP_ID, ELEVATED_TOKEN),
    )
    expect(screen.getByRole("button", { name: /add notes/i })).toBeDefined()
  })

  it("shows error and does not return to idle when Delete fails", async () => {
    vi.mocked(revokeTripMedicalNotes).mockResolvedValue({
      success: false,
      error: "Failed to revoke notes.",
    })
    render(<FloatPlanMedicalTabSection tripId={TRIP_ID} hasStoredNotes={true} sharedAt={null} />)
    await openToEdit({ hasStoredTripNotes: true })
    await userEvent.click(screen.getByRole("button", { name: /delete/i }))

    await waitFor(() => expect(screen.getByText("Failed to revoke notes.")).toBeDefined())
    // Not reverted to idle — the notes, Save, and Delete controls are still shown.
    expect(screen.queryByRole("button", { name: /add notes/i })).toBeNull()
    expect(screen.getByRole("button", { name: /^save$/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /delete/i })).toBeInTheDocument()
  })

  it("shows a Share with trip leader button", async () => {
    render(<FloatPlanMedicalTabSection tripId={TRIP_ID} hasStoredNotes={true} sharedAt={null} />)
    await openToEdit({ hasStoredTripNotes: true })
    expect(screen.getByRole("button", { name: /share with.*leader/i })).toBeDefined()
  })

  it("seals a second copy to the leader's public key and shares only that blob", async () => {
    vi.mocked(shareMedicalNotes).mockResolvedValue({ success: true })
    render(<FloatPlanMedicalTabSection tripId={TRIP_ID} hasStoredNotes={true} sharedAt={null} />)
    await openToEdit({ hasStoredTripNotes: true })
    await userEvent.click(screen.getByRole("button", { name: /share with.*leader/i }))
    await waitFor(() =>
      expect(encryptForRecipient).toHaveBeenCalledWith("Allergic to penicillin", LEADER_PUBLIC_KEY),
    )
    // ephemeralPublicKey is the crypto module's name for the value the wire calls
    // ephemeralKey — the mapping happens here, at the transport boundary.
    expect(shareMedicalNotes).toHaveBeenCalledWith(TRIP_ID, ELEVATED_TOKEN, {
      ciphertext: SEALED_FOR_LEADER.ciphertext,
      nonce: SEALED_FOR_LEADER.nonce,
      ephemeralKey: SEALED_FOR_LEADER.ephemeralPublicKey,
    })
  })

  it("reports a leader with no keypair and seals nothing", async () => {
    // The leader's public key is what the notes are sealed to, so there is nothing to
    // encrypt without it. Sharing must stop here rather than post an unreadable blob and
    // set hasLeaderMedicalNotes against notes no one can open.
    vi.mocked(getLeaderPublicKey).mockResolvedValue({
      success: false,
      error: "The trip leader has not set up encryption yet — ask them to, then try again.",
    })
    render(<FloatPlanMedicalTabSection tripId={TRIP_ID} hasStoredNotes={true} sharedAt={null} />)
    await openToEdit({ hasStoredTripNotes: true })
    await userEvent.click(screen.getByRole("button", { name: /share with.*leader/i }))
    await waitFor(() => expect(screen.getByText(/has not set up encryption/i)).toBeDefined())
    expect(encryptForRecipient).not.toHaveBeenCalled()
    expect(shareMedicalNotes).not.toHaveBeenCalled()
  })

  it("shows shared confirmation after successful share", async () => {
    vi.mocked(shareMedicalNotes).mockResolvedValue({ success: true })
    render(<FloatPlanMedicalTabSection tripId={TRIP_ID} hasStoredNotes={true} sharedAt={null} />)
    await openToEdit({ hasStoredTripNotes: true })
    await userEvent.click(screen.getByRole("button", { name: /share with.*leader/i }))
    await waitFor(() => expect(screen.getByText(/shared with.*leader/i)).toBeDefined())
  })

  it("shows error when share fails", async () => {
    vi.mocked(shareMedicalNotes).mockResolvedValue({
      success: false,
      error: "Session expired. Please try again.",
    })
    render(<FloatPlanMedicalTabSection tripId={TRIP_ID} hasStoredNotes={true} sharedAt={null} />)
    await openToEdit({ hasStoredTripNotes: true })
    await userEvent.click(screen.getByRole("button", { name: /share with.*leader/i }))
    await waitFor(() =>
      expect(screen.getByText("Session expired. Please try again.")).toBeDefined(),
    )
  })
})
