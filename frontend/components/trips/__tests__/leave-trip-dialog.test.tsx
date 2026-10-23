import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

vi.mock("@/lib/trips/actions", () => ({ leaveTrip: vi.fn() }))

import { LeaveTripDialog } from "../leave-trip-dialog"
import { leaveTrip } from "@/lib/trips/actions"

const TRIP_ID = "01952f1a-0000-7000-8000-000000000001"

function renderDialog({
  isLeader = false,
  soleMember = false,
  open = true,
}: { isLeader?: boolean; soleMember?: boolean; open?: boolean } = {}) {
  const onOpenChange = vi.fn()
  render(
    <LeaveTripDialog
      tripId={TRIP_ID}
      isLeader={isLeader}
      soleMember={soleMember}
      open={open}
      onOpenChange={onOpenChange}
    />,
  )
  return { onOpenChange }
}

beforeEach(() => vi.clearAllMocks())

describe("LeaveTripDialog", () => {
  it("renders nothing while closed", () => {
    renderDialog({ open: false })
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
  })

  it("shows crew-facing copy for a crew member", () => {
    renderDialog()
    expect(screen.getByText(/lose access to this trip/i)).toBeInTheDocument()
  })

  it("warns the leader that leaving makes the trip leaderless", () => {
    renderDialog({ isLeader: true })
    expect(screen.getByText(/leaderless until a crew member claims it/i)).toBeInTheDocument()
  })

  it("warns a sole-member leader that leaving deletes the trip", () => {
    renderDialog({ isLeader: true, soleMember: true })
    expect(screen.getByText(/delete this trip and all its data/i)).toBeInTheDocument()
  })

  it("calls leaveTrip when confirmed, and closes", async () => {
    const { onOpenChange } = renderDialog()
    await userEvent.click(screen.getByRole("button", { name: "Leave" }))
    expect(leaveTrip).toHaveBeenCalledWith(TRIP_ID)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("leaves the trip alone when cancelled", async () => {
    const { onOpenChange } = renderDialog()
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }))
    expect(leaveTrip).not.toHaveBeenCalled()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
