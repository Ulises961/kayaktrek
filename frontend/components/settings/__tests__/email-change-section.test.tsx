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
  await userEvent.type(screen.getByLabelText(/password/i), PASSWORD)
  await userEvent.click(screen.getByRole("button", { name: /continue/i }))
  await waitFor(() => expect(screen.getByLabelText(/new email/i)).toBeInTheDocument())
}

describe("EmailChangeSection — idle state", () => {
  it("shows the current email and a Change email button", () => {
    render(<EmailChangeSection currentMail={CURRENT_MAIL} />)
    expect(screen.getByText(CURRENT_MAIL)).toBeDefined()
    expect(screen.getByRole("button", { name: /change email/i })).toBeDefined()
  })

  it("does not show a password field at rest", () => {
    render(<EmailChangeSection currentMail={CURRENT_MAIL} />)
    expect(screen.queryByLabelText(/password/i)).toBeNull()
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
    expect(screen.getByLabelText(/password/i)).toBeDefined()
    expect(screen.getByRole("button", { name: /continue/i })).toBeDefined()
  })

  it("calls reAuth on Continue", async () => {
    vi.mocked(reAuth).mockResolvedValue({ success: true, elevatedToken: ELEVATED_TOKEN })
    render(<EmailChangeSection currentMail={CURRENT_MAIL} />)
    await userEvent.click(screen.getByRole("button", { name: /change email/i }))
    await userEvent.type(screen.getByLabelText(/password/i), PASSWORD)
    await userEvent.click(screen.getByRole("button", { name: /continue/i }))
    await waitFor(() => expect(reAuth).toHaveBeenCalledWith(PASSWORD))
  })

  it("shows an error when reAuth returns wrong password", async () => {
    vi.mocked(reAuth).mockResolvedValue({ success: false, error: "Password incorrect." })
    render(<EmailChangeSection currentMail={CURRENT_MAIL} />)
    await userEvent.click(screen.getByRole("button", { name: /change email/i }))
    await userEvent.type(screen.getByLabelText(/password/i), "wrong")
    await userEvent.click(screen.getByRole("button", { name: /continue/i }))
    await waitFor(() => expect(screen.getByText("Password incorrect.")).toBeDefined())
  })

  it("returns to idle on Cancel", async () => {
    render(<EmailChangeSection currentMail={CURRENT_MAIL} />)
    await userEvent.click(screen.getByRole("button", { name: /change email/i }))
    await userEvent.click(screen.getByText(/cancel/i))
    expect(screen.getByRole("button", { name: /change email/i })).toBeDefined()
    expect(screen.queryByLabelText(/password/i)).toBeNull()
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
    expect(screen.getByLabelText(/new email/i)).toBeDefined()
  })

  it("returns to idle on Cancel", async () => {
    await openToEditing()
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }))
    expect(screen.getByRole("button", { name: /change email/i })).toBeDefined()
  })
})
