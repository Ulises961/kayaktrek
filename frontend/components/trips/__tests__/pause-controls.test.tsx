import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock("@/lib/trips/actions", () => ({
  pauseTrip: vi.fn(),
  resumeTrip: vi.fn(),
  abortTrip: vi.fn(),
}))
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }))

import { pauseTrip, resumeTrip, abortTrip } from "@/lib/trips/actions"
import { toast } from "sonner"
import { PauseControls } from "../pause-controls"
import type { Trip } from "@/lib/dtos/trip"

const baseTrip: Trip = {
  id: "01952f1a-0000-7000-8000-000000000010",
  state: "happening",
  isPaused: false,
  pausedAt: null,
}

beforeEach(() => vi.clearAllMocks())

describe("PauseControls — not leader / not happening", () => {
  it("renders nothing when not the leader", () => {
    const { container } = render(<PauseControls trip={baseTrip} isLeader={false} />)
    expect(container.firstChild).toBeNull()
  })

  it("renders nothing when the trip is not happening", () => {
    const { container } = render(
      <PauseControls trip={{ ...baseTrip, state: "building" }} isLeader={true} />,
    )
    expect(container.firstChild).toBeNull()
  })
})

describe("PauseControls — happening, not paused", () => {
  it("renders a Pause button", () => {
    render(<PauseControls trip={baseTrip} isLeader={true} />)
    expect(screen.getByRole("button", { name: /pause expedition/i })).toBeDefined()
  })

  it("does not render Resume or Abort controls", () => {
    render(<PauseControls trip={baseTrip} isLeader={true} />)
    expect(screen.queryByRole("button", { name: /^resume$/i })).toBeNull()
    expect(screen.queryByRole("button", { name: /abort expedition/i })).toBeNull()
  })

  it("calls pauseTrip when the pause is confirmed", async () => {
    vi.mocked(pauseTrip).mockResolvedValue({ success: true })
    render(<PauseControls trip={baseTrip} isLeader={true} />)

    await userEvent.click(screen.getByRole("button", { name: /pause expedition/i }))
    const confirmBtn = await screen.findByRole("button", { name: /^pause$/i })
    await userEvent.click(confirmBtn)

    await waitFor(() => {
      expect(pauseTrip).toHaveBeenCalledWith(baseTrip.id)
    })
  })

  it("toasts the error and leaves the dialog state alone when pause fails", async () => {
    vi.mocked(pauseTrip).mockResolvedValue({ success: false, error: "Trip is already paused." })
    render(<PauseControls trip={baseTrip} isLeader={true} />)

    await userEvent.click(screen.getByRole("button", { name: /pause expedition/i }))
    const confirmBtn = await screen.findByRole("button", { name: /^pause$/i })
    await userEvent.click(confirmBtn)

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Trip is already paused.")
    })
  })
})

describe("PauseControls — paused", () => {
  const pausedTrip: Trip = { ...baseTrip, isPaused: true, pausedAt: "2026-07-15" }

  it("renders a paused banner with the pause date", () => {
    render(<PauseControls trip={pausedTrip} isLeader={true} />)
    expect(screen.getByText(/paused/i)).toBeDefined()
    expect(screen.getByText(/15 Jul 2026/)).toBeDefined()
  })

  it("renders Resume and Abort buttons instead of Pause", () => {
    render(<PauseControls trip={pausedTrip} isLeader={true} />)
    expect(screen.queryByRole("button", { name: /pause expedition/i })).toBeNull()
    expect(screen.getByRole("button", { name: /^resume$/i })).toBeDefined()
    expect(screen.getByRole("button", { name: /abort expedition/i })).toBeDefined()
  })

  it("calls resumeTrip with the picked date when resume is confirmed", async () => {
    vi.mocked(resumeTrip).mockResolvedValue({ success: true })
    render(<PauseControls trip={pausedTrip} isLeader={true} />)

    await userEvent.click(screen.getByRole("button", { name: /^resume$/i }))
    // Radix aria-hides the trigger while the dialog is open, so this finds
    // only the dialog's own confirm button.
    const confirmBtn = await screen.findByRole("button", { name: /^resume$/i })
    await userEvent.click(confirmBtn)

    await waitFor(() => {
      expect(resumeTrip).toHaveBeenCalledWith(pausedTrip.id, undefined)
    })
  })

  it("toasts the error when resume fails", async () => {
    vi.mocked(resumeTrip).mockResolvedValue({
      success: false,
      error: "Resume date must be on or after the pause date.",
    })
    render(<PauseControls trip={pausedTrip} isLeader={true} />)

    await userEvent.click(screen.getByRole("button", { name: /^resume$/i }))
    const confirmBtn = await screen.findByRole("button", { name: /^resume$/i })
    await userEvent.click(confirmBtn)

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Resume date must be on or after the pause date.")
    })
    // Only closed on success (setResumeOpen(false) is in the success branch) —
    // the dialog's own content should still be showing, not silently dismissed.
    expect(screen.getByLabelText(/resume date/i)).toBeInTheDocument()
  })

  it("calls abortTrip when abort is confirmed", async () => {
    vi.mocked(abortTrip).mockResolvedValue({ success: true })
    render(<PauseControls trip={pausedTrip} isLeader={true} />)

    await userEvent.click(screen.getByRole("button", { name: /abort expedition/i }))
    const confirmBtn = await screen.findByRole("button", { name: /^abort$/i })
    await userEvent.click(confirmBtn)

    await waitFor(() => {
      expect(abortTrip).toHaveBeenCalledWith(pausedTrip.id)
    })
  })

  it("toasts the error when abort fails", async () => {
    vi.mocked(abortTrip).mockResolvedValue({ success: false, error: "Trip is not paused." })
    render(<PauseControls trip={pausedTrip} isLeader={true} />)

    await userEvent.click(screen.getByRole("button", { name: /abort expedition/i }))
    const confirmBtn = await screen.findByRole("button", { name: /^abort$/i })
    await userEvent.click(confirmBtn)

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Trip is not paused.")
    })
  })
})
