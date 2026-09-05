import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { verifyAccount } from "@/lib/auth/actions"
import { VerifyConfirm } from "../verify-confirm"

vi.mock("@/lib/auth/actions", () => ({ verifyAccount: vi.fn() }))

const mockVerify = vi.mocked(verifyAccount)

// A promise the test resolves itself. A never-resolving one leaves the action's transition
// open past the end of the test, and the component then survives cleanup into the next
// file-mates' DOM — which is what made these assertions pass alone and fail together.
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => (resolve = r))
  return { promise, resolve }
}

beforeEach(() => vi.clearAllMocks())

describe("VerifyConfirm", () => {
  it("does nothing until the user actually clicks — no verification on render", () => {
    // The whole reason verification moved behind a click: a mail scanner or link-preview
    // fetcher rendering this page must not consume the token.
    render(<VerifyConfirm token="tok-123" />)

    expect(mockVerify).not.toHaveBeenCalled()
    expect(screen.getByRole("button", { name: /confirm my email/i })).toBeEnabled()
  })

  it("sends the token from the URL when clicked", async () => {
    mockVerify.mockResolvedValue({ success: false, error: "anything" })
    render(<VerifyConfirm token="tok-123" />)

    await userEvent.click(screen.getByRole("button", { name: /confirm my email/i }))

    await waitFor(() => expect(mockVerify).toHaveBeenCalledWith("tok-123"))
  })

  it("shows the server's reason when the link has expired, and offers a way onward", async () => {
    mockVerify.mockResolvedValue({ success: false, error: "This link has expired." })
    render(<VerifyConfirm token="stale" />)

    await userEvent.click(screen.getByRole("button", { name: /confirm my email/i }))

    expect(await screen.findByText("This link has expired.")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /back to sign in/i })).toHaveAttribute("href", "/login")
  })

  it("disables the button while the request is in flight, and restores it after", async () => {
    const pending = deferred<{ success: false; error: string }>()
    mockVerify.mockReturnValue(pending.promise)
    render(<VerifyConfirm token="tok-123" />)

    await userEvent.click(screen.getByRole("button", { name: /confirm my email/i }))
    expect(await screen.findByRole("button", { name: /confirming/i })).toBeDisabled()

    pending.resolve({ success: false, error: "Expired." })

    expect(await screen.findByRole("button", { name: /confirm my email/i })).toBeEnabled()
  })
})
