import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

vi.mock("@/lib/profile/actions", () => ({
  reAuth: vi.fn(),
  getMedicalNotes: vi.fn(),
  grantMedicalConsent: vi.fn(),
  revokeMedicalConsent: vi.fn(),
}))
// The crypto is mocked here so these tests stay about the component's phases and error
// states. Its correctness is pinned by the cross-language vectors
// (lib/crypto/__tests__), and running the real 600,000-iteration derivation per
// interaction would add seconds to this file for no extra assurance.
vi.mock("@/lib/crypto/medical", () => ({
  encrypt: vi.fn(),
  decrypt: vi.fn(),
}))

import {
  reAuth,
  getMedicalNotes,
  grantMedicalConsent,
  revokeMedicalConsent,
} from "@/lib/profile/actions"
import { encrypt, decrypt } from "@/lib/crypto/medical"
import { MedicalNotesSection } from "../medical-notes-section"

const ELEVATED_TOKEN = "eyJ.elevated.token"
const PASSWORD = "MyPass1!"
const SEALED = { ciphertext: "Y3Q=", nonce: "bm9uY2U=", salt: "c2FsdA==" }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(encrypt).mockResolvedValue(SEALED)
})

async function openToEdit(hasStoredNotes = false) {
  render(<MedicalNotesSection hasStoredNotes={hasStoredNotes} />)
  vi.mocked(reAuth).mockResolvedValue({ success: true, elevatedToken: ELEVATED_TOKEN })
  vi.mocked(getMedicalNotes).mockResolvedValue({
    success: true,
    sealed: hasStoredNotes ? SEALED : null,
  })
  vi.mocked(decrypt).mockResolvedValue("Allergic to penicillin")
  await userEvent.click(
    screen.getByRole("button", { name: hasStoredNotes ? /edit/i : /add notes/i }),
  )
  await userEvent.type(screen.getByLabelText(/password/i, { selector: "input" }), PASSWORD)
  await userEvent.click(screen.getByRole("button", { name: /continue/i }))
  // Wait for the editing phase to fully settle: the Save button only renders with
  // the name "Save" once the decrypt transition's isPending clears (it reads
  // "Saving…" while pending). Waiting on the textbox alone can resolve mid-
  // transition under load, leaving the button disabled and unmatchable.
  await waitFor(() => expect(screen.getByRole("button", { name: /^save$/i })).toBeInTheDocument())
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
    expect(screen.queryByLabelText(/password/i, { selector: "input" })).toBeNull()
  })
})

describe("MedicalNotesSection — reset prompt", () => {
  it("shows a re-entry prompt when resetAt is set and no notes are stored", () => {
    render(<MedicalNotesSection hasStoredNotes={false} resetAt="2026-06-16T10:00:00Z" />)
    expect(screen.getByText(/reset your password/i)).toBeDefined()
    expect(screen.getByText(/re-enter/i)).toBeDefined()
  })

  it("does not show the prompt when resetAt is absent", () => {
    render(<MedicalNotesSection hasStoredNotes={false} />)
    expect(screen.queryByText(/reset your password/i)).toBeNull()
  })

  it("hides the prompt once notes have been re-entered", async () => {
    vi.mocked(grantMedicalConsent).mockResolvedValue({ success: true })
    render(<MedicalNotesSection hasStoredNotes={false} resetAt="2026-06-16T10:00:00Z" />)
    vi.mocked(reAuth).mockResolvedValue({ success: true, elevatedToken: ELEVATED_TOKEN })
    vi.mocked(getMedicalNotes).mockResolvedValue({ success: true, sealed: null })
    await userEvent.click(screen.getByRole("button", { name: /add notes/i }))
    await userEvent.type(screen.getByLabelText(/password/i, { selector: "input" }), PASSWORD)
    await userEvent.click(screen.getByRole("button", { name: /continue/i }))
    await waitFor(() => expect(screen.getByRole("textbox")).toBeDefined())
    await userEvent.type(screen.getByRole("textbox"), "Blood type A+")
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }))
    // Done only appears once the save transition has exited. See vitest.setup.ts.
    await userEvent.click(await screen.findByRole("button", { name: /done/i }))
    // Waited, not asserted synchronously: the prompt is gated on `hasNotes`, which the save
    // sets inside a transition, so a synchronous read can land before that has committed.
    // It passed locally and failed on a loaded CI runner, where the suite takes about four
    // times as long. `waitFor` cannot mask a real failure here — a prompt that never clears
    // still times out.
    await waitFor(() => expect(screen.queryByText(/reset your password/i)).toBeNull())
  })
})

describe("MedicalNotesSection — authenticating state", () => {
  it("shows a password field and Continue button after clicking Edit", async () => {
    render(<MedicalNotesSection hasStoredNotes={true} />)
    await userEvent.click(screen.getByRole("button", { name: /edit/i }))
    expect(screen.getByLabelText(/password/i, { selector: "input" })).toBeDefined()
    expect(screen.getByRole("button", { name: /continue/i })).toBeDefined()
  })

  it("calls reAuth then getMedicalNotes on Continue", async () => {
    vi.mocked(reAuth).mockResolvedValue({ success: true, elevatedToken: ELEVATED_TOKEN })
    vi.mocked(getMedicalNotes).mockResolvedValue({ success: true, sealed: null })
    render(<MedicalNotesSection hasStoredNotes={false} />)
    await userEvent.click(screen.getByRole("button", { name: /add notes/i }))
    await userEvent.type(screen.getByLabelText(/password/i, { selector: "input" }), PASSWORD)
    await userEvent.click(screen.getByRole("button", { name: /continue/i }))
    await waitFor(() => expect(reAuth).toHaveBeenCalledWith(PASSWORD))
    // The elevated token is the only argument — the password stays in the browser.
    expect(getMedicalNotes).toHaveBeenCalledWith(ELEVATED_TOKEN)
  })

  it("shows an error when reAuth returns wrong password", async () => {
    vi.mocked(reAuth).mockResolvedValue({ success: false, error: "Password incorrect." })
    render(<MedicalNotesSection hasStoredNotes={false} />)
    await userEvent.click(screen.getByRole("button", { name: /add notes/i }))
    await userEvent.type(screen.getByLabelText(/password/i, { selector: "input" }), "wrong")
    await userEvent.click(screen.getByRole("button", { name: /continue/i }))
    await waitFor(() => expect(screen.getByText("Password incorrect.")).toBeDefined())
  })

  it("explains a stale ciphertext and still opens the editor so the notes can be replaced", async () => {
    // reAuth accepted the password, so this is not a wrong password — the stored notes
    // were sealed under an older one and nothing can recover them. Stranding the user in
    // the password step would leave no way past it; the editor is the way out.
    vi.mocked(reAuth).mockResolvedValue({ success: true, elevatedToken: ELEVATED_TOKEN })
    vi.mocked(getMedicalNotes).mockResolvedValue({ success: true, sealed: SEALED })
    vi.mocked(decrypt).mockRejectedValue(new Error("invalid tag"))
    render(<MedicalNotesSection hasStoredNotes={true} />)
    await userEvent.click(screen.getByRole("button", { name: /edit/i }))
    await userEvent.type(screen.getByLabelText(/password/i, { selector: "input" }), PASSWORD)
    await userEvent.click(screen.getByRole("button", { name: /continue/i }))

    await waitFor(() => expect(screen.getByText(/different password/i)).toBeDefined())
    const textbox = await screen.findByRole("textbox")
    // Empty, not the undecryptable ciphertext — saving would otherwise store a base64
    // blob as the user's medical notes.
    expect((textbox as HTMLTextAreaElement).value).toBe("")
  })

  it("returns to idle on Cancel", async () => {
    render(<MedicalNotesSection hasStoredNotes={false} />)
    await userEvent.click(screen.getByRole("button", { name: /add notes/i }))
    await userEvent.click(screen.getByText(/cancel/i))
    expect(screen.getByRole("button", { name: /add notes/i })).toBeDefined()
    expect(screen.queryByLabelText(/password/i, { selector: "input" })).toBeNull()
  })

  it("shows an error and stays out of the editing phase when getMedicalNotes fails after a valid password", async () => {
    vi.mocked(reAuth).mockResolvedValue({ success: true, elevatedToken: ELEVATED_TOKEN })
    vi.mocked(getMedicalNotes).mockResolvedValue({ success: false, error: "Decryption failed." })
    render(<MedicalNotesSection hasStoredNotes={true} />)
    await userEvent.click(screen.getByRole("button", { name: /edit/i }))
    await userEvent.type(screen.getByLabelText(/password/i, { selector: "input" }), PASSWORD)
    await userEvent.click(screen.getByRole("button", { name: /continue/i }))

    await waitFor(() => expect(screen.getByText("Decryption failed.")).toBeDefined())
    // A failed decrypt must not drop the user into the editing textarea with
    // whatever partial/undefined notes state happened to be lying around.
    expect(screen.queryByRole("textbox")).toBeNull()
    expect(screen.getByRole("button", { name: /continue/i })).toBeDefined()
  })
})

describe("MedicalNotesSection — editing state", () => {
  it("shows a textarea pre-filled with fetched notes", async () => {
    await openToEdit(true)
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe(
      "Allergic to penicillin",
    )
  })

  it("shows an empty textarea when no notes are stored yet", async () => {
    await openToEdit(false)
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("")
  })

  it("seals the notes in the browser and sends only the ciphertext on save", async () => {
    vi.mocked(grantMedicalConsent).mockResolvedValue({ success: true })
    await openToEdit(false)
    await userEvent.type(screen.getByRole("textbox"), "Blood type A+")
    await userEvent.click(screen.getByRole("button", { name: /^save$/i }))
    await waitFor(() => expect(encrypt).toHaveBeenCalledWith("Blood type A+", PASSWORD))
    // The action is transport: it receives the sealed triple and neither the notes nor
    // the password, which is what keeps the plaintext off the wire to the Next server.
    expect(grantMedicalConsent).toHaveBeenCalledWith(ELEVATED_TOKEN, SEALED)
  })

  it("shows a saved confirmation after successful save", async () => {
    vi.mocked(grantMedicalConsent).mockResolvedValue({ success: true })
    await openToEdit(true)
    const saveBtn = screen.getByRole("button", { name: /^save$/i })
    await userEvent.click(saveBtn)
    await waitFor(() => expect(grantMedicalConsent).toHaveBeenCalled())
    expect(screen.getByText(/saved/i)).toBeDefined()
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

  it("shows an error and keeps the notes in place when delete fails — no silent success", async () => {
    vi.mocked(revokeMedicalConsent).mockResolvedValue({
      success: false,
      error: "Could not delete notes.",
    })
    await openToEdit(true)
    await userEvent.click(screen.getByRole("button", { name: /delete/i }))

    await waitFor(() => expect(screen.getByText("Could not delete notes.")).toBeDefined())
    // Must still be in the editing phase with the notes and Delete button intact —
    // a failed revoke must not present as if the notes were removed.
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe(
      "Allergic to penicillin",
    )
    expect(screen.getByRole("button", { name: /delete/i })).toBeDefined()
    expect(screen.queryByRole("button", { name: /add notes/i })).toBeNull()
  })

  it("returns to idle when Done is clicked", async () => {
    await openToEdit(true)
    await userEvent.click(screen.getByRole("button", { name: /done/i }))
    expect(screen.getByRole("button", { name: /edit/i })).toBeDefined()
    expect(screen.queryByRole("textbox")).toBeNull()
  })
})
