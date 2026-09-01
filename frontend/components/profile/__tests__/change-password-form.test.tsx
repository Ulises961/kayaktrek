import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

vi.mock("@/lib/profile/actions", () => ({
  changePassword: vi.fn(),
  reAuth: vi.fn(),
  getKeypair: vi.fn(),
}))
vi.mock("@/lib/crypto/medical", () => ({ decrypt: vi.fn(), encrypt: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: vi.fn() }))

import { changePassword, reAuth, getKeypair } from "@/lib/profile/actions"
import { decrypt, encrypt } from "@/lib/crypto/medical"
import { useRouter } from "next/navigation"
import { ChangePasswordForm } from "../change-password-form"

const mockPush = vi.fn()

const KEYPAIR = {
  publicKey: "pub",
  privateKeyCiphertext: "old-ct",
  privateKeyNonce: "old-nonce",
  privateKeySalt: "old-salt",
}
const REWRAPPED = { ciphertext: "new-ct", nonce: "new-nonce", salt: "new-salt" }

beforeEach(() => {
  vi.clearAllMocks()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(useRouter).mockReturnValue({ push: mockPush } as any)
})

async function fillAndSubmit(current: string, next: string, confirm: string, hasKeypair = false) {
  render(<ChangePasswordForm hasKeypair={hasKeypair} />)
  await userEvent.type(screen.getByLabelText("Current password"), current)
  await userEvent.type(screen.getByLabelText("New password"), next)
  await userEvent.type(screen.getByLabelText("Confirm new password"), confirm)
  await userEvent.click(screen.getByRole("button", { name: /update password/i }))
}

describe("ChangePasswordForm — no keypair", () => {
  it("renders all three password fields", () => {
    render(<ChangePasswordForm hasKeypair={false} />)
    expect(screen.getByLabelText("Current password")).toBeDefined()
    expect(screen.getByLabelText("New password")).toBeDefined()
    expect(screen.getByLabelText("Confirm new password")).toBeDefined()
  })

  it("calls changePassword with current and new passwords on submit, and never re-auths", async () => {
    vi.mocked(changePassword).mockResolvedValue({ success: true })
    await fillAndSubmit("OldPass1!", "NewPass1!", "NewPass1!")

    await waitFor(() => expect(changePassword).toHaveBeenCalledWith("OldPass1!", "NewPass1!"))
    // No keypair to re-wrap, so the password-crypto detour must not run at all.
    expect(reAuth).not.toHaveBeenCalled()
    expect(getKeypair).not.toHaveBeenCalled()
  })

  it("redirects to /settings on success", async () => {
    vi.mocked(changePassword).mockResolvedValue({ success: true })
    await fillAndSubmit("OldPass1!", "NewPass1!", "NewPass1!")

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/settings?changed=1"))
  })

  it("shows a field error when passwords do not match", async () => {
    render(<ChangePasswordForm hasKeypair={false} />)
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
    // A failed change must not redirect away or look like it succeeded.
    expect(mockPush).not.toHaveBeenCalled()
  })

  it("shows a root-level error for a non-field failure and does not navigate", async () => {
    vi.mocked(changePassword).mockResolvedValue({
      success: false,
      error: "Too many attempts. Try again later.",
    })
    await fillAndSubmit("OldPass1!", "NewPass1!", "NewPass1!")

    await waitFor(() =>
      expect(screen.getByText("Too many attempts. Try again later.")).toBeDefined(),
    )
    expect(mockPush).not.toHaveBeenCalled()
  })

  it("does not submit with an empty current password", async () => {
    render(<ChangePasswordForm hasKeypair={false} />)
    await userEvent.type(screen.getByLabelText("New password"), "NewPass1!")
    await userEvent.type(screen.getByLabelText("Confirm new password"), "NewPass1!")
    await userEvent.click(screen.getByRole("button", { name: /update password/i }))

    await waitFor(() => expect(changePassword).not.toHaveBeenCalled())
  })
})

describe("ChangePasswordForm — with keypair (M22 rewrap)", () => {
  it("re-auths, fetches the wrapped key, rewraps it locally, and posts ciphertext only", async () => {
    vi.mocked(reAuth).mockResolvedValue({ success: true, elevatedToken: "elevated-tok" })
    vi.mocked(getKeypair).mockResolvedValue({ success: true, keypair: KEYPAIR })
    vi.mocked(decrypt).mockResolvedValue("raw-private-key-b64")
    vi.mocked(encrypt).mockResolvedValue(REWRAPPED)
    vi.mocked(changePassword).mockResolvedValue({ success: true })

    await fillAndSubmit("OldPass1!", "NewPass1!", "NewPass1!", true)

    await waitFor(() => expect(changePassword).toHaveBeenCalled())
    expect(reAuth).toHaveBeenCalledWith("OldPass1!")
    expect(getKeypair).toHaveBeenCalledWith("elevated-tok")
    expect(decrypt).toHaveBeenCalledWith("old-ct", "old-nonce", "old-salt", "OldPass1!")
    expect(encrypt).toHaveBeenCalledWith("raw-private-key-b64", "NewPass1!")
    // The password never leaves this decrypt/encrypt round trip — only the sealed result does.
    expect(changePassword).toHaveBeenCalledWith("OldPass1!", "NewPass1!", REWRAPPED)
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/settings?changed=1"))
  })

  it("shows a currentPwd field error and does not call changePassword when re-auth fails", async () => {
    vi.mocked(reAuth).mockResolvedValue({ success: false, error: "Password incorrect." })

    await fillAndSubmit("WrongPass1!", "NewPass1!", "NewPass1!", true)

    await waitFor(() => expect(screen.getByText("Password incorrect.")).toBeDefined())
    expect(getKeypair).not.toHaveBeenCalled()
    expect(changePassword).not.toHaveBeenCalled()
    expect(mockPush).not.toHaveBeenCalled()
  })

  it("shows a root error and does not call changePassword when the keypair fetch fails", async () => {
    vi.mocked(reAuth).mockResolvedValue({ success: true, elevatedToken: "elevated-tok" })
    vi.mocked(getKeypair).mockResolvedValue({
      success: false,
      error: "Session expired. Please try again.",
    })

    await fillAndSubmit("OldPass1!", "NewPass1!", "NewPass1!", true)

    await waitFor(() =>
      expect(screen.getByText("Session expired. Please try again.")).toBeDefined(),
    )
    expect(changePassword).not.toHaveBeenCalled()
    expect(mockPush).not.toHaveBeenCalled()
  })

  it("shows a root error and does not call changePassword when the local decrypt throws", async () => {
    vi.mocked(reAuth).mockResolvedValue({ success: true, elevatedToken: "elevated-tok" })
    vi.mocked(getKeypair).mockResolvedValue({ success: true, keypair: KEYPAIR })
    vi.mocked(decrypt).mockRejectedValue(new Error("bad tag"))

    await fillAndSubmit("OldPass1!", "NewPass1!", "NewPass1!", true)

    await waitFor(() =>
      expect(
        screen.getByText("Could not re-encrypt your medical-notes key. Please try again."),
      ).toBeDefined(),
    )
    expect(changePassword).not.toHaveBeenCalled()
    expect(mockPush).not.toHaveBeenCalled()
  })
})
