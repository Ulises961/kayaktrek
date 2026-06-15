import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

vi.mock("@/lib/trips/actions", () => ({
  handleInvitation: vi.fn(),
}))

import { handleInvitation } from "@/lib/trips/actions"
import { InvitationActions } from "../invitation-actions"

const TRIP_ID = "01952f1a-0000-7000-8000-000000000010"

beforeEach(() => vi.clearAllMocks())

describe("InvitationActions", () => {
  it("renders Accept and Decline buttons", () => {
    render(<InvitationActions tripId={TRIP_ID} />)
    expect(screen.getByRole("button", { name: /accept/i })).toBeDefined()
    expect(screen.getByRole("button", { name: /decline/i })).toBeDefined()
  })

  it("calls handleInvitation with accepted: true on Accept", async () => {
    vi.mocked(handleInvitation).mockResolvedValue({ success: true })
    render(<InvitationActions tripId={TRIP_ID} />)

    await userEvent.click(screen.getByRole("button", { name: /accept/i }))

    await waitFor(() => {
      expect(handleInvitation).toHaveBeenCalledWith(TRIP_ID, true)
    })
  })

  it("calls handleInvitation with accepted: false on Decline", async () => {
    vi.mocked(handleInvitation).mockResolvedValue({ success: true })
    render(<InvitationActions tripId={TRIP_ID} />)

    await userEvent.click(screen.getByRole("button", { name: /decline/i }))

    await waitFor(() => {
      expect(handleInvitation).toHaveBeenCalledWith(TRIP_ID, false)
    })
  })

  it("disables both buttons while a response is pending", async () => {
    let resolve: (v: { success: true }) => void
    vi.mocked(handleInvitation).mockReturnValue(
      new Promise((r) => {
        resolve = r
      }),
    )
    render(<InvitationActions tripId={TRIP_ID} />)

    await userEvent.click(screen.getByRole("button", { name: /accept/i }))

    expect(screen.getByRole("button", { name: /accept/i })).toBeDisabled()
    expect(screen.getByRole("button", { name: /decline/i })).toBeDisabled()

    resolve!({ success: true })
  })
})
