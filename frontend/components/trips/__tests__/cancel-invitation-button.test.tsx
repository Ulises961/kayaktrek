import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

vi.mock("@/lib/trips/actions", () => ({
  cancelInvitation: vi.fn(),
}))

import { cancelInvitation } from "@/lib/trips/actions"
import { CancelInvitationButton } from "../cancel-invitation-button"

const TRIP_ID = "01952f1a-0000-7000-8000-000000000010"
const INVITEE_ID = "01952f1a-0000-7000-8000-000000000020"

beforeEach(() => vi.clearAllMocks())

describe("CancelInvitationButton", () => {
  it("renders a button", () => {
    render(<CancelInvitationButton tripId={TRIP_ID} inviteeId={INVITEE_ID} />)
    expect(screen.getByRole("button")).toBeDefined()
  })

  it("calls cancelInvitation with tripId and inviteeId on click", async () => {
    vi.mocked(cancelInvitation).mockResolvedValue({ success: true })
    render(<CancelInvitationButton tripId={TRIP_ID} inviteeId={INVITEE_ID} />)

    await userEvent.click(screen.getByRole("button"))

    await waitFor(() => {
      expect(cancelInvitation).toHaveBeenCalledWith(TRIP_ID, INVITEE_ID)
    })
  })

  it("disables the button while the action is pending", async () => {
    let resolve: (v: { success: true }) => void
    vi.mocked(cancelInvitation).mockReturnValue(
      new Promise((r) => {
        resolve = r
      }),
    )
    render(<CancelInvitationButton tripId={TRIP_ID} inviteeId={INVITEE_ID} />)

    await userEvent.click(screen.getByRole("button"))
    expect(screen.getByRole("button")).toBeDisabled()

    resolve!({ success: true })
  })
})
