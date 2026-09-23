import { describe, it, expect, vi, afterEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { LoginForm } from "../login-form"
import { login } from "@/lib/auth/actions"
import { backfillKeypair } from "@/lib/crypto/keypair-backfill"

const replace = vi.fn()

vi.mock("@/lib/auth/actions", () => ({
  login: vi.fn(),
}))
vi.mock("@/lib/crypto/keypair-backfill", () => ({
  backfillKeypair: vi.fn(),
}))
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  useSearchParams: () => new URLSearchParams(),
}))

async function signIn(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/email/i), "paddler@example.com")
  await user.type(screen.getByLabelText(/^password$/i), "Expedition#24")
  await user.click(screen.getByRole("button", { name: /sign in/i }))
}

describe("LoginForm", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it("shows the server's error rather than navigating", async () => {
    const user = userEvent.setup()
    vi.mocked(login).mockResolvedValue({ success: false, error: "Invalid email or password." })

    render(<LoginForm />)
    await signIn(user)

    expect(await screen.findByTestId("auth-error")).toHaveTextContent("Invalid email or password.")
    expect(replace).not.toHaveBeenCalled()
  })

  describe("keypair backfill", () => {
    it("rebuilds a missing keypair with the password just typed, then continues", async () => {
      // The whole point: a password reset clears the keypair, and the browser can only
      // rebuild one while it still holds the password. Ordinary logins redirect server-side
      // and never reach this path.
      const user = userEvent.setup()
      vi.mocked(login).mockResolvedValue({ success: true, needsKeypair: true })
      vi.mocked(backfillKeypair).mockResolvedValue({ success: true })

      render(<LoginForm />)
      await signIn(user)

      await waitFor(() => expect(backfillKeypair).toHaveBeenCalledWith("Expedition#24"))
      await waitFor(() => expect(replace).toHaveBeenCalledWith("/dashboard"))
    })

    it("still signs the user in when the backfill fails", async () => {
      // Best-effort by design. The account is already authenticated by this point, so a
      // failed keypair must not strand anyone on the login page — it retries next sign-in.
      const user = userEvent.setup()
      vi.mocked(login).mockResolvedValue({ success: true, needsKeypair: true })
      vi.mocked(backfillKeypair).mockRejectedValue(new Error("network"))

      render(<LoginForm />)
      await signIn(user)

      await waitFor(() => expect(replace).toHaveBeenCalledWith("/dashboard"))
      expect(screen.queryByTestId("auth-error")).not.toBeInTheDocument()
    })

    it("says nothing about encryption while it runs", async () => {
      // Silent on purpose: medical notes are parked (M24), so naming the feature here would
      // advertise something the app does not currently offer.
      const user = userEvent.setup()
      vi.mocked(login).mockResolvedValue({ success: true, needsKeypair: true })
      vi.mocked(backfillKeypair).mockImplementation(() => new Promise(() => {}))

      render(<LoginForm />)
      await signIn(user)

      await waitFor(() => expect(backfillKeypair).toHaveBeenCalled())
      expect(screen.queryByText(/encryption|keypair|medical/i)).not.toBeInTheDocument()
      // Still reads as a sign-in in progress rather than a stalled button.
      expect(screen.getByRole("button", { name: /signing in/i })).toBeDisabled()
    })

    it("runs the backfill once, not on every re-render", async () => {
      const user = userEvent.setup()
      vi.mocked(login).mockResolvedValue({ success: true, needsKeypair: true })
      vi.mocked(backfillKeypair).mockResolvedValue({ success: true })

      render(<LoginForm />)
      await signIn(user)

      await waitFor(() => expect(replace).toHaveBeenCalled())
      expect(backfillKeypair).toHaveBeenCalledTimes(1)
    })
  })
})
