import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

vi.mock("@/lib/trips/actions", () => ({
  inviteUser: vi.fn(),
}))

import { inviteUser } from "@/lib/trips/actions"
import { InviteForm } from "../invite-form"

const TRIP_ID = "01952f1a-0000-7000-8000-000000000010"

beforeEach(() => vi.clearAllMocks())

describe("InviteForm", () => {
  it("renders an input and a submit button", () => {
    render(<InviteForm tripId={TRIP_ID} />)
    expect(screen.getByRole("textbox")).toBeDefined()
    expect(screen.getByRole("button", { name: /invite/i })).toBeDefined()
  })

  it("calls inviteUser with tripId and the entered value on submit", async () => {
    vi.mocked(inviteUser).mockResolvedValue({ success: true })
    render(<InviteForm tripId={TRIP_ID} />)

    await userEvent.type(screen.getByRole("textbox"), "bob-uuid")
    await userEvent.click(screen.getByRole("button", { name: /invite/i }))

    await waitFor(() => {
      expect(inviteUser).toHaveBeenCalledWith(TRIP_ID, "bob-uuid")
    })
  })

  it("clears the input after a successful invite", async () => {
    vi.mocked(inviteUser).mockResolvedValue({ success: true })
    render(<InviteForm tripId={TRIP_ID} />)

    const input = screen.getByRole("textbox")
    await userEvent.type(input, "bob-uuid")
    await userEvent.click(screen.getByRole("button", { name: /invite/i }))

    await waitFor(() => expect((input as HTMLInputElement).value).toBe(""))
  })

  it("shows an error message when the action returns success: false", async () => {
    vi.mocked(inviteUser).mockResolvedValue({ success: false, error: "User not found." })
    render(<InviteForm tripId={TRIP_ID} />)

    await userEvent.type(screen.getByRole("textbox"), "unknown")
    await userEvent.click(screen.getByRole("button", { name: /invite/i }))

    await waitFor(() => expect(screen.getByText("User not found.")).toBeDefined())
  })

  it("disables the button when the input is empty", () => {
    render(<InviteForm tripId={TRIP_ID} />)
    expect(screen.getByRole("button", { name: /invite/i })).toBeDisabled()
  })
})
