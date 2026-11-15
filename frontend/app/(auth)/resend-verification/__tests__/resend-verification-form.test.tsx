import { describe, it, expect, vi, afterEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { ResendVerificationForm } from "../resend-verification-form"
import { correctUnverifiedMail } from "@/lib/auth/actions"

vi.mock("@/lib/auth/actions", () => ({
  correctUnverifiedMail: vi.fn(),
}))

type User = ReturnType<typeof userEvent.setup>

async function fillCredentials(user: User) {
  await user.type(screen.getByLabelText(/email you signed up with/i), "typo@gmail.com")
  await user.type(screen.getByLabelText(/^password$/i), "Expedition#24")
}

function submittedFields(): FormData {
  const [, formData] = vi.mocked(correctUnverifiedMail).mock.calls[0]
  return formData as FormData
}

describe("ResendVerificationForm", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it("hides the confirmation until a corrected address is being typed", async () => {
    const user = userEvent.setup()
    render(<ResendVerificationForm />)

    expect(screen.queryByLabelText(/confirm correct email/i)).not.toBeInTheDocument()
    await user.type(screen.getByLabelText(/^correct email address/i), "r")

    expect(screen.getByLabelText(/confirm correct email/i)).toBeInTheDocument()
  })

  it("resends to the same address when no correction is typed", async () => {
    const user = userEvent.setup()
    vi.mocked(correctUnverifiedMail).mockResolvedValue({ success: true })
    render(<ResendVerificationForm />)

    await fillCredentials(user)
    await user.click(screen.getByRole("button", { name: /send verification email/i }))

    await waitFor(() => expect(correctUnverifiedMail).toHaveBeenCalled())
    expect(submittedFields().get("mail")).toBe("typo@gmail.com")
    expect(submittedFields().get("password")).toBe("Expedition#24")
    expect(submittedFields().get("newMail") ?? "").toBe("")
    expect(await screen.findByText("typo@gmail.com")).toBeInTheDocument()
  })

  it("sends the corrected address and tells the user where the link went", async () => {
    const user = userEvent.setup()
    vi.mocked(correctUnverifiedMail).mockResolvedValue({ success: true })
    render(<ResendVerificationForm />)

    await fillCredentials(user)
    await user.type(screen.getByLabelText(/^correct email address/i), "right@gmail.com")
    await user.type(screen.getByLabelText(/confirm correct email/i), "right@gmail.com")
    await user.click(screen.getByRole("button", { name: /send verification email/i }))

    await waitFor(() => expect(correctUnverifiedMail).toHaveBeenCalled())
    expect(submittedFields().get("newMail")).toBe("right@gmail.com")
    expect(await screen.findByText("right@gmail.com")).toBeInTheDocument()
    expect(screen.queryByText("typo@gmail.com")).not.toBeInTheDocument()
    expect(screen.getByRole("link", { name: /back to sign in/i })).toHaveAttribute("href", "/login")
  })

  it("does not submit a corrected address that does not match its confirmation", async () => {
    const user = userEvent.setup()
    render(<ResendVerificationForm />)

    await fillCredentials(user)
    await user.type(screen.getByLabelText(/^correct email address/i), "right@gmail.com")
    await user.type(screen.getByLabelText(/confirm correct email/i), "rihgt@gmail.com")
    await user.click(screen.getByRole("button", { name: /send verification email/i }))

    expect(await screen.findByText("The email addresses do not match.")).toBeInTheDocument()
    expect(correctUnverifiedMail).not.toHaveBeenCalled()
  })

  it("shows the server's refusal and stays on the form so the user can retry", async () => {
    const user = userEvent.setup()
    vi.mocked(correctUnverifiedMail).mockResolvedValue({
      success: false,
      error: "Wrong email or password.",
    })
    render(<ResendVerificationForm />)

    await fillCredentials(user)
    await user.click(screen.getByRole("button", { name: /send verification email/i }))

    expect(await screen.findByText("Wrong email or password.")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /send verification email/i })).toBeEnabled()
    expect(screen.queryByText(/check your email/i)).not.toBeInTheDocument()
  })

  it("points an already-verified account at sign-in", async () => {
    const user = userEvent.setup()
    vi.mocked(correctUnverifiedMail).mockResolvedValue({
      success: false,
      error: "This account is already verified — you can sign in.",
      code: "already_verified",
    })
    render(<ResendVerificationForm />)

    await fillCredentials(user)
    await user.click(screen.getByRole("button", { name: /send verification email/i }))

    expect(await screen.findByText(/this account is already verified/i)).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /sign in/i })).toHaveAttribute("href", "/login")
  })
})
