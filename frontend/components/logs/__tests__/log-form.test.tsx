import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

vi.mock("@/lib/logs/actions", () => ({
  createLog: vi.fn().mockResolvedValue({ success: true }),
  updateLog: vi.fn().mockResolvedValue({ success: true }),
}))

import { LogForm } from "../log-form"
import { createLog } from "@/lib/logs/actions"
import { DISTANCE_UNIT } from "@/lib/itinerary/distance"
import type { Log } from "@/lib/dtos/log"

const noop = () => {}

beforeEach(() => vi.clearAllMocks())

describe("LogForm — distance unit", () => {
  it("labels the distance field in km by default", () => {
    render(<LogForm onSuccess={noop} onCancel={noop} />)
    expect(screen.getByLabelText(/distance \(km\)/i)).toBeInTheDocument()
  })

  it("labels the distance field in nm when unit is nm", () => {
    render(<LogForm unit={DISTANCE_UNIT.NM} onSuccess={noop} onCancel={noop} />)
    expect(screen.getByLabelText(/distance \(nm\)/i)).toBeInTheDocument()
  })

  it("submits a km-denominated distance unchanged when unit is km", async () => {
    render(<LogForm unit={DISTANCE_UNIT.KM} onSuccess={noop} onCancel={noop} />)
    await userEvent.type(screen.getByLabelText(/distance/i), "18.5")
    await userEvent.click(screen.getByRole("button", { name: /add log/i }))
    await waitFor(() => expect(createLog).toHaveBeenCalled())
    expect(vi.mocked(createLog).mock.calls[0][0].distance).toBeCloseTo(18.5)
  })

  it("converts an nm-entered distance to km before submitting", async () => {
    render(<LogForm unit={DISTANCE_UNIT.NM} onSuccess={noop} onCancel={noop} />)
    await userEvent.type(screen.getByLabelText(/distance/i), "10")
    await userEvent.click(screen.getByRole("button", { name: /add log/i }))
    await waitFor(() => expect(createLog).toHaveBeenCalled())
    expect(vi.mocked(createLog).mock.calls[0][0].distance).toBeCloseTo(18.52)
  })

  it("prefills an existing log's km distance converted to the display unit", () => {
    const log: Log = { id: "1", distance: 18.52 }
    render(<LogForm log={log} unit={DISTANCE_UNIT.NM} onSuccess={noop} onCancel={noop} />)
    expect((screen.getByLabelText(/distance/i) as HTMLInputElement).value).toBe("10")
  })
})

describe("LogForm — dialog callbacks", () => {
  it("calls onSuccess after a successful submit", async () => {
    const onSuccess = vi.fn()
    render(<LogForm onSuccess={onSuccess} onCancel={noop} />)
    await userEvent.click(screen.getByRole("button", { name: /add log/i }))
    await waitFor(() => expect(onSuccess).toHaveBeenCalled())
  })

  it("calls onCancel when Cancel is clicked", async () => {
    const onCancel = vi.fn()
    render(<LogForm onSuccess={noop} onCancel={onCancel} />)
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }))
    expect(onCancel).toHaveBeenCalled()
  })

  it("displays an error when creating a log fails", async () => {
    vi.mocked(createLog).mockResolvedValueOnce({
      success: false,
      error: "Log date is in the future",
    })
    render(<LogForm onSuccess={noop} onCancel={noop} />)
    await userEvent.click(screen.getByRole("button", { name: /add log/i }))
    await waitFor(() => expect(screen.getByText("Log date is in the future")).toBeInTheDocument())
  })
})
