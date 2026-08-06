import { describe, it, expect, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

vi.mock("@/lib/trips/actions", () => ({ leaveTrip: vi.fn() }))

import { LeaveTripButton } from "../leave-trip-button"
import { leaveTrip } from "@/lib/trips/actions"

const TRIP_ID = "01952f1a-0000-7000-8000-000000000001"

describe("LeaveTripButton", () => {
  it("shows crew-facing copy for a crew member", async () => {
    render(<LeaveTripButton tripId={TRIP_ID} isLeader={false} soleMember={false} />)
    await userEvent.click(screen.getByRole("button", { name: /leave trip/i }))
    expect(screen.getByText(/lose access to this trip/i)).toBeInTheDocument()
  })

  it("warns the leader that leaving makes the trip leaderless", async () => {
    render(<LeaveTripButton tripId={TRIP_ID} isLeader={true} soleMember={false} />)
    await userEvent.click(screen.getByRole("button", { name: /leave trip/i }))
    expect(screen.getByText(/leaderless until a crew member claims it/i)).toBeInTheDocument()
  })

  it("warns a sole-member leader that leaving deletes the trip", async () => {
    render(<LeaveTripButton tripId={TRIP_ID} isLeader={true} soleMember={true} />)
    await userEvent.click(screen.getByRole("button", { name: /leave trip/i }))
    expect(screen.getByText(/delete this trip and all its data/i)).toBeInTheDocument()
  })

  it("calls leaveTrip when confirmed", async () => {
    render(<LeaveTripButton tripId={TRIP_ID} isLeader={false} soleMember={false} />)
    await userEvent.click(screen.getByRole("button", { name: /leave trip/i }))
    await userEvent.click(screen.getByRole("button", { name: "Leave" }))
    expect(leaveTrip).toHaveBeenCalledWith(TRIP_ID)
  })

  // No error UI exists on this component — leaveTrip redirects on success and
  // returns { success: false, error } on failure, without throwing. This
  // guards the failure branch actually resolves isPending instead of leaving
  // the trigger button stuck disabled.
  it("re-enables the trigger button after a failed leave instead of hanging", async () => {
    vi.mocked(leaveTrip).mockResolvedValue({ success: false, error: "Failed to leave trip." })
    render(<LeaveTripButton tripId={TRIP_ID} isLeader={false} soleMember={false} />)
    await userEvent.click(screen.getByRole("button", { name: /leave trip/i }))
    await userEvent.click(screen.getByRole("button", { name: "Leave" }))

    await waitFor(() => {
      expect(leaveTrip).toHaveBeenCalledWith(TRIP_ID)
      expect(screen.getByRole("button", { name: /leave trip/i })).not.toBeDisabled()
    })
  })
})
