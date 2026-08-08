import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

vi.mock("@/lib/profile/actions", () => ({ requestDataExport: vi.fn() }))

import { requestDataExport } from "@/lib/profile/actions"
import { DataExportButton } from "../data-export-button"

beforeEach(() => vi.clearAllMocks())

describe("DataExportButton", () => {
  it("renders the download button", () => {
    render(<DataExportButton />)
    expect(screen.getByRole("button", { name: /download my data/i })).toBeDefined()
  })

  it("shows a confirmation message after a successful request", async () => {
    vi.mocked(requestDataExport).mockResolvedValue({ success: true })
    render(<DataExportButton />)
    await userEvent.click(screen.getByRole("button", { name: /download my data/i }))

    await waitFor(() => expect(screen.getByText(/download link has been sent/i)).toBeDefined())
  })

  it("hides the button after a successful request", async () => {
    vi.mocked(requestDataExport).mockResolvedValue({ success: true })
    render(<DataExportButton />)
    await userEvent.click(screen.getByRole("button", { name: /download my data/i }))

    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /download my data/i })).toBeNull(),
    )
  })

  it("shows the error message on failure", async () => {
    vi.mocked(requestDataExport).mockResolvedValue({
      success: false,
      error: "You can only request a data export once per day.",
    })
    render(<DataExportButton />)
    await userEvent.click(screen.getByRole("button", { name: /download my data/i }))

    // A failed request must not look like it succeeded — the button stays for a
    // retry, and the "sent" confirmation must not appear. Both in one waitFor:
    // the error paints before the transition exits. See vitest.setup.ts.
    await waitFor(() => {
      expect(screen.getByText("You can only request a data export once per day.")).toBeDefined()
      expect(screen.getByRole("button", { name: /download my data/i })).toBeEnabled()
    })
    expect(screen.queryByText(/download link has been sent/i)).not.toBeInTheDocument()
  })
})
