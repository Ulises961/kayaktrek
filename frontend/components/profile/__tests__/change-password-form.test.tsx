import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

vi.mock("@/lib/profile/actions", () => ({ changePassword: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: vi.fn() }))

import { changePassword } from "@/lib/profile/actions"
import { useRouter } from "next/navigation"
import { ChangePasswordForm } from "../change-password-form"

const mockPush = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(useRouter).mockReturnValue({ push: mockPush } as any)
})

async function fillAndSubmit(current: string, next: string, confirm: string) {
  render(<ChangePasswordForm />)
  await userEvent.type(screen.getByLabelText("Current password"), current)
  await userEvent.type(screen.getByLabelText("New password"), next)
  await userEvent.type(screen.getByLabelText("Confirm new password"), confirm)
  await userEvent.click(screen.getByRole("button", { name: /update password/i }))
}

describe("ChangePasswordForm", () => {
  it("renders all three password fields", () => {
    render(<ChangePasswordForm />)
    expect(screen.getByLabelText("Current password")).toBeDefined()
    expect(screen.getByLabelText("New password")).toBeDefined()
    expect(screen.getByLabelText("Confirm new password")).toBeDefined()
  })

  it("calls changePassword with current and new passwords on submit", async () => {
    vi.mocked(changePassword).mockResolvedValue({ success: true })
    await fillAndSubmit("OldPass1!", "NewPass1!", "NewPass1!")

    await waitFor(() => expect(changePassword).toHaveBeenCalledWith("OldPass1!", "NewPass1!"))
  })

  it("redirects to /profile on success", async () => {
    vi.mocked(changePassword).mockResolvedValue({ success: true })
    await fillAndSubmit("OldPass1!", "NewPass1!", "NewPass1!")

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/profile?changed=1"))
  })

  it("shows a field error when passwords do not match", async () => {
    render(<ChangePasswordForm />)
    await userEvent.type(screen.getByLabelText("New password"), "NewPass1!")
    await userEvent.type(screen.getByLabelText("Confirm new password"), "Different1!")
    await userEvent.click(screen.getByRole("button", { name: /update password/i }))

    await waitFor(() => expect(screen.getByText(/do not match/i)).toBeDefined())
    expect(changePassword).not.toHaveBeenCalled()
  })

  it("shows the currentPwd field error when the API returns incorrect password", async () => {
    vi.mocked(changePassword).mockResolvedValue({
      success: false,
      error: "Current password is incorrect.",
    })
    await fillAndSubmit("WrongPass1!", "NewPass1!", "NewPass1!")

    await waitFor(() => expect(screen.getByText("Current password is incorrect.")).toBeDefined())
  })

  it("does not submit with an empty current password", async () => {
    render(<ChangePasswordForm />)
    await userEvent.type(screen.getByLabelText("New password"), "NewPass1!")
    await userEvent.type(screen.getByLabelText("Confirm new password"), "NewPass1!")
    await userEvent.click(screen.getByRole("button", { name: /update password/i }))

    await waitFor(() => expect(changePassword).not.toHaveBeenCalled())
  })
})
