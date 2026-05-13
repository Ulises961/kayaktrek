import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

vi.mock("@/lib/profile/actions", () => ({
  reAuth: vi.fn(),
  getMedicalNotes: vi.fn(),
  grantMedicalConsent: vi.fn(),
  revokeMedicalConsent: vi.fn(),
}))

import { reAuth, getMedicalNotes, grantMedicalConsent, revokeMedicalConsent } from "@/lib/profile/actions"
import { MedicalNotesSection } from "../medical-notes-section"

const ELEVATED_TOKEN = "eyJ.elevated.token"
const PASSWORD = "MyPass1!"

beforeEach(() => vi.clearAllMocks())

async function openToEdit(hasStoredNotes = false) {
  render(<MedicalNotesSection hasStoredNotes={hasStoredNotes} />)
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

describe("MedicalNotesSection — idle state", () => {
  it("shows status text and Edit button when notes are stored", () => {
    render(<MedicalNotesSection hasStoredNotes={true} />)
    expect(screen.getByText(/notes stored/i)).toBeDefined()
    expect(screen.getByRole("button", { name: /edit/i })).toBeDefined()
  })

  it("shows prompt text and Add notes button when no notes stored", () => {
    render(<MedicalNotesSection hasStoredNotes={false} />)
    expect(screen.getByText(/no notes stored/i)).toBeDefined()
    expect(screen.getByRole("button", { name: /add notes/i })).toBeDefined()
  })

  it("does not show a password field at rest", () => {
    render(<MedicalNotesSection hasStoredNotes={false} />)
    expect(screen.queryByLabelText(/password/i)).toBeNull()
  })
})

describe("MedicalNotesSection — authenticating state", () => {
  it("shows a password field and Continue button after clicking Edit", async () => {
    render(<MedicalNotesSection hasStoredNotes={true} />)
    await userEvent.click(screen.getByRole("button", { name: /edit/i }))
    expect(screen.getByLabelText(/password/i)).toBeDefined()
    expect(screen.getByRole("button", { name: /continue/i })).toBeDefined()
  })

  it("calls reAuth then getMedicalNotes on Continue", async () => {
    vi.mocked(reAuth).mockResolvedValue({ success: true, elevatedToken: ELEVATED_TOKEN })
    vi.mocked(getMedicalNotes).mockResolvedValue({ success: true, notes: null })
    render(<MedicalNotesSection hasStoredNotes={false} />)
    await userEvent.click(screen.getByRole("button", { name: /add notes/i }))
    await userEvent.type(screen.getByLabelText(/password/i), PASSWORD)
    await userEvent.click(screen.getByRole("button", { name: /continue/i }))
    await waitFor(() => expect(reAuth).toHaveBeenCalledWith(PASSWORD))
    expect(getMedicalNotes).toHaveBeenCalledWith(ELEVATED_TOKEN, PASSWORD)
  })

  it("shows an error when reAuth returns wrong password", async () => {
    vi.mocked(reAuth).mockResolvedValue({ success: false, error: "Password incorrect." })
    render(<MedicalNotesSection hasStoredNotes={false} />)
    await userEvent.click(screen.getByRole("button", { name: /add notes/i }))
    await userEvent.type(screen.getByLabelText(/password/i), "wrong")
    await userEvent.click(screen.getByRole("button", { name: /continue/i }))
    await waitFor(() => expect(screen.getByText("Password incorrect.")).toBeDefined())
  })

  it("returns to idle on Cancel", async () => {
    render(<MedicalNotesSection hasStoredNotes={false} />)
    await userEvent.click(screen.getByRole("button", { name: /add notes/i }))
    await userEvent.click(screen.getByText(/cancel/i))
    expect(screen.getByRole("button", { name: /add notes/i })).toBeDefined()
    expect(screen.queryByLabelText(/password/i)).toBeNull()
  })
})

describe("MedicalNotesSection — editing state", () => {
  it("shows a textarea pre-filled with fetched notes", async () => {
    await openToEdit(true)
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("Allergic to penicillin")
  })

  it("shows an empty textarea when no notes are stored yet", async () => {
    await openToEdit(false)
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("")
  })

  it("calls grantMedicalConsent with token, notes, and password on save", async () => {
    vi.mocked(grantMedicalConsent).mockResolvedValue({ success: true })
    await openToEdit(false)
    await userEvent.type(screen.getByRole("textbox"), "Blood type A+")
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }))
    await waitFor(() =>
      expect(grantMedicalConsent).toHaveBeenCalledWith(ELEVATED_TOKEN, "Blood type A+", PASSWORD)
    )
  })

  it("shows a saved confirmation after successful save", async () => {
    vi.mocked(grantMedicalConsent).mockResolvedValue({ success: true })
    await openToEdit(true)
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }))
    await waitFor(() => expect(screen.getByText(/saved/i)).toBeDefined())
  })

  it("shows an error when save fails", async () => {
    vi.mocked(grantMedicalConsent).mockResolvedValue({ success: false, error: "Session expired." })
    await openToEdit(true)
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }))
    await waitFor(() => expect(screen.getByText("Session expired.")).toBeDefined())
  })

  it("shows the Delete button only when notes are already stored", async () => {
    await openToEdit(true)
    expect(screen.getByRole("button", { name: /delete/i })).toBeDefined()
  })

  it("does not show the Delete button when no notes are stored", async () => {
    await openToEdit(false)
    expect(screen.queryByRole("button", { name: /delete/i })).toBeNull()
  })

  it("calls revokeMedicalConsent and returns to idle on delete", async () => {
    vi.mocked(revokeMedicalConsent).mockResolvedValue({ success: true })
    await openToEdit(true)
    await userEvent.click(screen.getByRole("button", { name: /delete/i }))
    await waitFor(() => expect(revokeMedicalConsent).toHaveBeenCalledWith(ELEVATED_TOKEN))
    expect(screen.getByRole("button", { name: /add notes/i })).toBeDefined()
  })

  it("returns to idle when Done is clicked", async () => {
    await openToEdit(true)
    await userEvent.click(screen.getByRole("button", { name: /done/i }))
    expect(screen.getByRole("button", { name: /edit/i })).toBeDefined()
    expect(screen.queryByRole("textbox")).toBeNull()
  })
})
