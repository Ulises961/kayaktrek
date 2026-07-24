import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

vi.mock("@/lib/live/actions", () => ({
  closeDay: vi.fn(),
}))

import { closeDay } from "@/lib/live/actions"
import { CloseDayButton } from "../close-day-button"

const TRIP_ID = "01952f1a-0000-7000-8000-000000000001"

beforeEach(() => vi.clearAllMocks())

describe("CloseDayButton", () => {
  it("renders a Close day trigger", () => {
    render(<CloseDayButton tripId={TRIP_ID} />)
    expect(screen.getByRole("button", { name: /close day/i })).toBeDefined()
  })

  it("does not call closeDay before confirming", async () => {
    render(<CloseDayButton tripId={TRIP_ID} />)
    await userEvent.click(screen.getByRole("button", { name: /close day/i }))
    expect(closeDay).not.toHaveBeenCalled()
  })

  it("calls closeDay with the trip id when confirmed", async () => {
    vi.mocked(closeDay).mockResolvedValue({ success: true })
    render(<CloseDayButton tripId={TRIP_ID} />)

    await userEvent.click(screen.getByRole("button", { name: /close day/i }))
    const confirmBtn = await screen.findByRole("button", { name: /^close day$/i })
    await userEvent.click(confirmBtn)

    await waitFor(() => {
      expect(closeDay).toHaveBeenCalledWith(TRIP_ID)
    })
  })

  it("shows the success confirmation after closing", async () => {
    vi.mocked(closeDay).mockResolvedValue({ success: true })
    render(<CloseDayButton tripId={TRIP_ID} />)

    await userEvent.click(screen.getByRole("button", { name: /close day/i }))
    const confirmBtn = await screen.findByRole("button", { name: /^close day$/i })
    await userEvent.click(confirmBtn)

    expect(await screen.findByText(/day closed — logs are being generated/i)).toBeDefined()
  })

  it("shows the error message when closeDay fails", async () => {
    vi.mocked(closeDay).mockResolvedValue({ success: false, error: "No day scheduled for today." })
    render(<CloseDayButton tripId={TRIP_ID} />)

    await userEvent.click(screen.getByRole("button", { name: /close day/i }))
    const confirmBtn = await screen.findByRole("button", { name: /^close day$/i })
    await userEvent.click(confirmBtn)

    expect(await screen.findByText("No day scheduled for today.")).toBeDefined()
  })
})
