import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

vi.mock("@/lib/trips/actions", () => ({
  inviteUser: vi.fn(),
}))

import { inviteUser } from "@/lib/trips/actions"
import { InviteForm } from "../invite-form"

const TRIP_ID = "01952f1a-0000-7000-8000-000000000010"
const VALID_EMAIL = "paddler@example.com"

beforeEach(() => vi.clearAllMocks())

describe("InviteForm", () => {
  it("renders an email input and a submit button", () => {
    render(<InviteForm tripId={TRIP_ID} />)
    expect(screen.getByRole("textbox")).toBeDefined()
    expect(screen.getByRole("button", { name: /invite/i })).toBeDefined()
  })

  it("calls inviteUser with tripId and the entered email on submit", async () => {
    vi.mocked(inviteUser).mockResolvedValue({ success: true })
    render(<InviteForm tripId={TRIP_ID} />)

    await userEvent.type(screen.getByRole("textbox"), VALID_EMAIL)
    await userEvent.click(screen.getByRole("button", { name: /invite/i }))

    await waitFor(() => {
      expect(inviteUser).toHaveBeenCalledWith(TRIP_ID, VALID_EMAIL)
    })
  })

  it("clears the input after a successful invite", async () => {
    vi.mocked(inviteUser).mockResolvedValue({ success: true })
    render(<InviteForm tripId={TRIP_ID} />)

    const input = screen.getByRole("textbox")
    await userEvent.type(input, VALID_EMAIL)
    await userEvent.click(screen.getByRole("button", { name: /invite/i }))

    await waitFor(() => expect((input as HTMLInputElement).value).toBe(""))
  })

  it("shows a validation error for an invalid email format", async () => {
    render(<InviteForm tripId={TRIP_ID} />)

    await userEvent.type(screen.getByRole("textbox"), "not-an-email")
    await userEvent.click(screen.getByRole("button", { name: /invite/i }))

    await waitFor(() => expect(screen.getByText(/valid email/i)).toBeDefined())
    expect(inviteUser).not.toHaveBeenCalled()
  })

  it("shows an error message when the action returns success: false", async () => {
    vi.mocked(inviteUser).mockResolvedValue({ success: false, error: "No account found for that email address" })
    render(<InviteForm tripId={TRIP_ID} />)

    await userEvent.type(screen.getByRole("textbox"), VALID_EMAIL)
    await userEvent.click(screen.getByRole("button", { name: /invite/i }))

    await waitFor(() => expect(screen.getByText("No account found for that email address")).toBeDefined())
  })
})
