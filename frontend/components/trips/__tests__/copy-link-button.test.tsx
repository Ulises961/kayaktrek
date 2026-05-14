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
})
