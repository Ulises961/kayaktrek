import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

vi.mock("@/lib/logs/actions", () => ({ endorseLog: vi.fn(), unendorseLog: vi.fn() }))

import { endorseLog, unendorseLog } from "@/lib/logs/actions"
import { EndorseButton } from "../endorse-button"

beforeEach(() => vi.clearAllMocks())

describe("EndorseButton", () => {
  it("withdraws an existing endorsement", async () => {
    vi.mocked(unendorseLog).mockResolvedValue({ success: true })
    render(<EndorseButton logId="log-1" endorsed />)
    await userEvent.click(screen.getByRole("button", { name: /endorsed/i }))
    expect(unendorseLog).toHaveBeenCalledWith("log-1")
    await waitFor(() => expect(screen.getByRole("button", { name: /^endorse$/i })).toBeTruthy())
  })

  it("endorses a log that is not yet endorsed", async () => {
    vi.mocked(endorseLog).mockResolvedValue({ success: true })
    render(<EndorseButton logId="log-1" endorsed={false} />)
    await userEvent.click(screen.getByRole("button", { name: /^endorse$/i }))
    expect(endorseLog).toHaveBeenCalledWith("log-1")
    await waitFor(() => expect(screen.getByRole("button", { name: /endorsed/i })).toBeTruthy())
  })

  it("surfaces the error and keeps the prior state on failure", async () => {
    vi.mocked(endorseLog).mockResolvedValue({
      success: false,
      error: "You can only endorse logs from a trip you shared.",
    })
    render(<EndorseButton logId="log-1" endorsed={false} />)
    await userEvent.click(screen.getByRole("button", { name: /^endorse$/i }))
    await waitFor(() => expect(screen.getByText(/trip you shared/i)).toBeTruthy())
    expect(screen.getByRole("button", { name: /^endorse$/i })).toBeTruthy()
  })
})
