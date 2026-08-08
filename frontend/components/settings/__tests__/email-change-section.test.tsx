import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

vi.mock("@/lib/profile/actions", () => ({
  reAuth: vi.fn(),
  requestEmailChange: vi.fn(),
}))

import { reAuth, requestEmailChange } from "@/lib/profile/actions"
import { EmailChangeSection } from "../email-change-section"

const ELEVATED_TOKEN = "eyJ.elevated.token"
const PASSWORD = "MyPass1!"
const CURRENT_MAIL = "ada@example.com"
const NEW_MAIL = "new@example.com"

beforeEach(() => vi.clearAllMocks())

async function openToEditing() {
  render(<EmailChangeSection currentMail={CURRENT_MAIL} />)
  vi.mocked(reAuth).mockResolvedValue({ success: true, elevatedToken: ELEVATED_TOKEN })
  await userEvent.click(screen.getByRole("button", { name: /change email/i }))
  await userEvent.type(screen.getByLabelText(/password/i, { selector: "input" }), PASSWORD)
  await userEvent.click(screen.getByRole("button", { name: /continue/i }))
  // The input appears before the re-auth transition exits, and every caller goes
  // on to click the submit button — which is still named "Sending…" until it does.
  // See vitest.setup.ts.
  await waitFor(() => {
    expect(screen.getByLabelText(/new email/i)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /send confirmation link/i })).toBeInTheDocument()
  })
}

describe("EmailChangeSection — idle state", () => {
  it("shows the current email and a Change email button", () => {
    render(<EmailChangeSection currentMail={CURRENT_MAIL} />)
    expect(screen.getByText(CURRENT_MAIL)).toBeDefined()
    expect(screen.getByRole("button", { name: /change email/i })).toBeDefined()
  })

  it("does not show a password field at rest", () => {
    render(<EmailChangeSection currentMail={CURRENT_MAIL} />)
    expect(screen.queryByLabelText(/password/i, { selector: "input" })).toBeNull()
  })
})

describe("EmailChangeSection — pending state", () => {
  it("shows the pending banner instead of the Change email button when pendingMail is set", () => {
    render(<EmailChangeSection currentMail={CURRENT_MAIL} pendingMail={NEW_MAIL} />)
    expect(screen.getByText(new RegExp(NEW_MAIL))).toBeDefined()
    expect(screen.queryByRole("button", { name: /change email/i })).toBeNull()
  })
})

describe("EmailChangeSection — authenticating state", () => {
  it("shows a password field and Continue button after clicking Change email", async () => {
    render(<EmailChangeSection currentMail={CURRENT_MAIL} />)
    await userEvent.click(screen.getByRole("button", { name: /change email/i }))
    expect(screen.getByLabelText(/password/i, { selector: "input" })).toBeDefined()
    expect(screen.getByRole("button", { name: /continue/i })).toBeDefined()
  })

  it("calls reAuth on Continue", async () => {
    vi.mocked(reAuth).mockResolvedValue({ success: true, elevatedToken: ELEVATED_TOKEN })
    render(<EmailChangeSection currentMail={CURRENT_MAIL} />)
    await userEvent.click(screen.getByRole("button", { name: /change email/i }))
    await userEvent.type(screen.getByLabelText(/password/i, { selector: "input" }), PASSWORD)
    await userEvent.click(screen.getByRole("button", { name: /continue/i }))
    await waitFor(() => expect(reAuth).toHaveBeenCalledWith(PASSWORD))
  })

  it("shows an error when reAuth returns wrong password, without exposing the email form", async () => {
    vi.mocked(reAuth).mockResolvedValue({ success: false, error: "Password incorrect." })
    render(<EmailChangeSection currentMail={CURRENT_MAIL} />)
    await userEvent.click(screen.getByRole("button", { name: /change email/i }))
    await userEvent.type(screen.getByLabelText(/password/i, { selector: "input" }), "wrong")
    await userEvent.click(screen.getByRole("button", { name: /continue/i }))
    await waitFor(() => expect(screen.getByText("Password incorrect.")).toBeDefined())
    // A failed re-auth must not advance to the editing phase — no elevated token
    // was actually granted, so the new-email input must not appear.
    expect(screen.queryByLabelText(/new email/i)).not.toBeInTheDocument()
    expect(requestEmailChange).not.toHaveBeenCalled()
  })

  it("returns to idle on Cancel", async () => {
    render(<EmailChangeSection currentMail={CURRENT_MAIL} />)
    await userEvent.click(screen.getByRole("button", { name: /change email/i }))
    await userEvent.click(screen.getByText(/cancel/i))
    expect(screen.getByRole("button", { name: /change email/i })).toBeDefined()
    expect(screen.queryByLabelText(/password/i, { selector: "input" })).toBeNull()
  })
})

describe("EmailChangeSection — editing state", () => {
  it("shows a new-email input", async () => {
    await openToEditing()
    expect(screen.getByLabelText(/new email/i)).toBeDefined()
  })

  it("calls requestEmailChange with the elevated token and typed address", async () => {
    vi.mocked(requestEmailChange).mockResolvedValue({ success: true })
    await openToEditing()
    await userEvent.type(screen.getByLabelText(/new email/i), NEW_MAIL)
    await userEvent.click(screen.getByRole("button", { name: /send confirmation/i }))
    await waitFor(() => expect(requestEmailChange).toHaveBeenCalledWith(ELEVATED_TOKEN, NEW_MAIL))
  })

  it("shows the pending banner after a successful request", async () => {
    vi.mocked(requestEmailChange).mockResolvedValue({ success: true })
    await openToEditing()
    await userEvent.type(screen.getByLabelText(/new email/i), NEW_MAIL)
    await userEvent.click(screen.getByRole("button", { name: /send confirmation/i }))
    await waitFor(() => expect(screen.getByText(new RegExp(NEW_MAIL))).toBeDefined())
    expect(screen.queryByLabelText(/new email/i)).toBeNull()
  })

  it("shows an error and stays in editing when the request fails", async () => {
    vi.mocked(requestEmailChange).mockResolvedValue({
      success: false,
      error: "That address can't be used. Try a different one.",
    })
    await openToEditing()
    await userEvent.type(screen.getByLabelText(/new email/i), NEW_MAIL)
    await userEvent.click(screen.getByRole("button", { name: /send confirmation/i }))
    await waitFor(() =>
      expect(screen.getByText("That address can't be used. Try a different one.")).toBeDefined(),
    )
    // A failed request must not flip to the "pending confirmation" banner or leak
    // the rejected address as if it were awaiting a confirmation click.
    expect(screen.queryByRole("status")).not.toBeInTheDocument()
    expect(
      screen.queryByText(new RegExp(`pending change to.*${NEW_MAIL}`, "i")),
    ).not.toBeInTheDocument()
    expect((screen.getByLabelText(/new email/i) as HTMLInputElement).value).toBe(NEW_MAIL)
  })

  it("returns to idle on Cancel", async () => {
    await openToEditing()
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }))
    expect(screen.getByRole("button", { name: /change email/i })).toBeDefined()
  })
})
