import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { CopyLinkButton } from "../copy-link-button"

const mockWriteText = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  mockWriteText.mockResolvedValue(undefined)
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: mockWriteText },
    writable: true,
    configurable: true,
  })
})

describe("CopyLinkButton", () => {
  it("renders a Copy link button", () => {
    render(<CopyLinkButton />)
    expect(screen.getByRole("button", { name: /copy link/i })).toBeDefined()
  })

  it("calls clipboard.writeText with the current href on click", async () => {
    render(<CopyLinkButton />)
    await userEvent.click(screen.getByRole("button", { name: /copy link/i }))
    await waitFor(() => expect(mockWriteText).toHaveBeenCalledWith(window.location.href))
  })

  it("shows Copied! feedback after clicking", async () => {
    render(<CopyLinkButton />)
    await userEvent.click(screen.getByRole("button", { name: /copy link/i }))
    await waitFor(() => expect(screen.getByText(/copied/i)).toBeDefined())
  })

  // Clipboard access can be denied (insecure context, missing permission).
  // The button has no error UI (matches float-plan-share-section's and
  // story-share-button's copy handlers) — this asserts the actual, current
  // consequence: the label never flips to "Copied!" and the button is left
  // usable, rather than asserting fiction about error handling that doesn't
  // exist.
  it("leaves the label unchanged when clipboard.writeText rejects", async () => {
    mockWriteText.mockRejectedValue(new Error("denied"))
    render(<CopyLinkButton />)
    await userEvent.click(screen.getByRole("button", { name: /copy link/i }))

    await waitFor(() => expect(mockWriteText).toHaveBeenCalled())
    expect(screen.queryByText(/copied/i)).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: /copy link/i })).toBeEnabled()
  })
})
