import { describe, it, expect, vi, afterEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { ResendVerificationForm } from "../resend-verification-form"
import { resendVerification } from "@/lib/auth/actions"
import { SUPPORT_MAIL } from "@/lib/support"

vi.mock("@/lib/auth/actions", () => ({
  resendVerification: vi.fn(),
}))

async function submit(user: ReturnType<typeof userEvent.setup>, address: string) {
  await user.type(screen.getByLabelText(/^email$/i), address)
  await user.click(screen.getByRole("button", { name: /send verification email/i }))
}

describe("ResendVerificationForm", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it("asks for the email only — there is no field to change the address", () => {
    render(<ResendVerificationForm />)

    expect(screen.getByLabelText(/^email$/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/correct email/i)).not.toBeInTheDocument()
  })

  it("sends the address typed", async () => {
    const user = userEvent.setup()
    vi.mocked(resendVerification).mockResolvedValue({ success: true })
    render(<ResendVerificationForm />)

    await submit(user, "kayaker@example.com")

    await waitFor(() => expect(resendVerification).toHaveBeenCalled())
    const [, formData] = vi.mocked(resendVerification).mock.calls[0]
    expect((formData as FormData).get("mail")).toBe("kayaker@example.com")
  })

  it("does not submit a malformed address", async () => {
    const user = userEvent.setup()
    render(<ResendVerificationForm />)

    await submit(user, "not-an-address")

    expect(await screen.findByText("Enter a valid email address.")).toBeInTheDocument()
    expect(resendVerification).not.toHaveBeenCalled()
  })

  it("offers support beneath the form for a mistyped address", () => {
    render(<ResendVerificationForm />)

    expect(screen.getByText(/didn't get it\?/i)).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /contact support/i })).toHaveAttribute(
      "href",
      `mailto:${SUPPORT_MAIL}`,
    )
  })

  it("confirms without saying whether the account exists, and keeps the support route", async () => {
    const user = userEvent.setup()
    vi.mocked(resendVerification).mockResolvedValue({ success: true })
    render(<ResendVerificationForm />)

    await submit(user, "kayaker@example.com")

    expect(
      await screen.findByText(/if that address has an unverified account/i),
    ).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /contact support/i })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /back to sign in/i })).toHaveAttribute("href", "/login")
  })

  it("shows the server's refusal and stays on the form so the user can retry", async () => {
    const user = userEvent.setup()
    vi.mocked(resendVerification).mockResolvedValue({
      success: false,
      error: "Too many attempts. Please try again in a while.",
    })
    render(<ResendVerificationForm />)

    await submit(user, "kayaker@example.com")

    expect(await screen.findByText(/too many attempts/i)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /send verification email/i })).toBeEnabled()
    expect(screen.queryByText(/check your email/i)).not.toBeInTheDocument()
  })
})
