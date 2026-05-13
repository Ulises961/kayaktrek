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

async function unlock(hasStoredNotes = false) {
  render(<MedicalNotesSection hasStoredNotes={hasStoredNotes} />)
  vi.mocked(reAuth).mockResolvedValue({ success: true, elevatedToken: ELEVATED_TOKEN })
  vi.mocked(getMedicalNotes).mockResolvedValue({
    success: true,
    notes: hasStoredNotes ? "Allergic to penicillin" : null,
  })
  await userEvent.type(screen.getByLabelText(/password/i), PASSWORD)
  await userEvent.click(screen.getByRole("button", { name: /unlock/i }))
  await waitFor(() => expect(screen.getByRole("textbox")).toBeDefined())
}

describe("MedicalNotesSection — locked state", () => {
  it("renders a password field and unlock button", () => {
    render(<MedicalNotesSection hasStoredNotes={false} />)
    expect(screen.getByLabelText(/password/i)).toBeDefined()
    expect(screen.getByRole("button", { name: /unlock/i })).toBeDefined()
  })

  it("calls reAuth then getMedicalNotes on unlock", async () => {
    vi.mocked(reAuth).mockResolvedValue({ success: true, elevatedToken: ELEVATED_TOKEN })
    vi.mocked(getMedicalNotes).mockResolvedValue({ success: true, notes: null })
    render(<MedicalNotesSection hasStoredNotes={false} />)
    await userEvent.type(screen.getByLabelText(/password/i), PASSWORD)
    await userEvent.click(screen.getByRole("button", { name: /unlock/i }))
    await waitFor(() => expect(reAuth).toHaveBeenCalledWith(PASSWORD))
    expect(getMedicalNotes).toHaveBeenCalledWith(ELEVATED_TOKEN, PASSWORD)
  })

  it("shows an error when reAuth returns wrong password", async () => {
    vi.mocked(reAuth).mockResolvedValue({ success: false, error: "Password incorrect." })
    render(<MedicalNotesSection hasStoredNotes={false} />)
    await userEvent.type(screen.getByLabelText(/password/i), "wrong")
    await userEvent.click(screen.getByRole("button", { name: /unlock/i }))
    await waitFor(() => expect(screen.getByText("Password incorrect.")).toBeDefined())
  })

  it("stays locked when reAuth fails", async () => {
    vi.mocked(reAuth).mockResolvedValue({ success: false, error: "Password incorrect." })
    render(<MedicalNotesSection hasStoredNotes={false} />)
    await userEvent.type(screen.getByLabelText(/password/i), "wrong")
    await userEvent.click(screen.getByRole("button", { name: /unlock/i }))
    await waitFor(() => expect(screen.getByRole("button", { name: /unlock/i })).toBeDefined())
    expect(screen.queryByRole("textbox")).toBeNull()
  })
})

describe("MedicalNotesSection — unlocked state", () => {
  it("shows a textarea pre-filled with fetched notes", async () => {
    await unlock(true)
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("Allergic to penicillin")
  })

  it("shows an empty textarea when no notes are stored yet", async () => {
    await unlock(false)
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("")
  })

  it("calls grantMedicalConsent with token, notes, and password on save", async () => {
    vi.mocked(grantMedicalConsent).mockResolvedValue({ success: true })
    await unlock(false)
    await userEvent.type(screen.getByRole("textbox"), "Blood type A+")
    await userEvent.click(screen.getByRole("button", { name: /save/i }))
    await waitFor(() =>
      expect(grantMedicalConsent).toHaveBeenCalledWith(ELEVATED_TOKEN, "Blood type A+", PASSWORD)
    )
  })

  it("shows a saved confirmation after successful save", async () => {
    vi.mocked(grantMedicalConsent).mockResolvedValue({ success: true })
    await unlock(true)
    await userEvent.click(screen.getByRole("button", { name: /save/i }))
    await waitFor(() => expect(screen.getByText(/saved/i)).toBeDefined())
  })

  it("shows an error when save fails", async () => {
    vi.mocked(grantMedicalConsent).mockResolvedValue({ success: false, error: "Session expired." })
    await unlock(true)
    await userEvent.click(screen.getByRole("button", { name: /save/i }))
    await waitFor(() => expect(screen.getByText("Session expired.")).toBeDefined())
  })

  it("shows the delete button only when notes are already stored", async () => {
    await unlock(true)
    expect(screen.getByRole("button", { name: /delete/i })).toBeDefined()
  })

  it("does not show the delete button when no notes are stored", async () => {
    await unlock(false)
    expect(screen.queryByRole("button", { name: /delete/i })).toBeNull()
  })

  it("calls revokeMedicalConsent and returns to locked state on delete", async () => {
    vi.mocked(revokeMedicalConsent).mockResolvedValue({ success: true })
    await unlock(true)
    await userEvent.click(screen.getByRole("button", { name: /delete/i }))
    await waitFor(() => expect(revokeMedicalConsent).toHaveBeenCalledWith(ELEVATED_TOKEN))
    expect(screen.getByRole("button", { name: /unlock/i })).toBeDefined()
  })

  it("locks again when the lock button is clicked", async () => {
    await unlock(false)
    await userEvent.click(screen.getByRole("button", { name: /lock/i }))
    expect(screen.getByRole("button", { name: /unlock/i })).toBeDefined()
  })
})
