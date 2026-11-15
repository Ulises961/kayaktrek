import { describe, it, expect, vi, afterEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { RegisterForm } from "../register-form"
import { register as registerAction } from "@/lib/auth/actions"
import { generateKeypair } from "@/lib/crypto/medical"

vi.mock("@/lib/auth/actions", () => ({
  register: vi.fn(),
}))
vi.mock("@/lib/crypto/medical", () => ({
  generateKeypair: vi.fn(),
}))

async function fillRequiredFields(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/^email$/i), "a@b.com")
  await user.type(screen.getByLabelText(/username/i), "kayaker")
  await user.type(screen.getByLabelText(/^password$/i), "Expedition#24")
}

describe("RegisterForm", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it("renders no invite code field when the kill switch is not armed", () => {
    render(<RegisterForm inviteCodeRequired={false} />)
    expect(screen.queryByLabelText(/invite code/i)).not.toBeInTheDocument()
  })

  it("renders the invite code field when the kill switch is armed", () => {
    render(<RegisterForm inviteCodeRequired={true} />)
    expect(screen.getByLabelText(/invite code/i)).toBeInTheDocument()
  })

  it("never submits an inviteCode field when the switch is off", async () => {
    const user = userEvent.setup()
    vi.mocked(generateKeypair).mockResolvedValue({
      publicKey: "pub",
      privateKeyCiphertext: "ct",
      privateKeyNonce: "nonce",
      privateKeySalt: "salt",
    })
    vi.mocked(registerAction).mockResolvedValue({ success: true })

    render(<RegisterForm inviteCodeRequired={false} />)
    await fillRequiredFields(user)
    await user.click(screen.getByRole("button", { name: /create account/i }))

    await waitFor(() => expect(registerAction).toHaveBeenCalled())
    const [, formData] = vi.mocked(registerAction).mock.calls[0]
    expect((formData as FormData).has("inviteCode")).toBe(false)
  })

  it("submits the invite code when the switch is on and the field is filled", async () => {
    const user = userEvent.setup()
    vi.mocked(generateKeypair).mockResolvedValue({
      publicKey: "pub",
      privateKeyCiphertext: "ct",
      privateKeyNonce: "nonce",
      privateKeySalt: "salt",
    })
    vi.mocked(registerAction).mockResolvedValue({ success: true })

    render(<RegisterForm inviteCodeRequired={true} />)
    await user.type(screen.getByLabelText(/invite code/i), "beta-2026")
    await fillRequiredFields(user)
    await user.click(screen.getByRole("button", { name: /create account/i }))

    await waitFor(() => expect(registerAction).toHaveBeenCalled())
    const [, formData] = vi.mocked(registerAction).mock.calls[0]
    expect((formData as FormData).get("inviteCode")).toBe("beta-2026")
  })

  it("asks for the email address once", () => {
    render(<RegisterForm inviteCodeRequired={false} />)
    expect(screen.getAllByLabelText(/email/i)).toHaveLength(1)
  })

  it("disables the submit button for the whole submit, including keypair generation", async () => {
    const user = userEvent.setup()
    let resolveKeypair!: (v: Awaited<ReturnType<typeof generateKeypair>>) => void
    vi.mocked(generateKeypair).mockReturnValue(
      new Promise((resolve) => {
        resolveKeypair = resolve
      }),
    )
    vi.mocked(registerAction).mockResolvedValue({ success: true })

    render(<RegisterForm inviteCodeRequired={false} />)
    await fillRequiredFields(user)
    await user.click(screen.getByRole("button", { name: /create account/i }))

    // Still awaiting generateKeypair — startTransition hasn't even been called yet, so
    // this is exactly the window that used to read as an unresponsive button.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /creating account/i })).toBeDisabled(),
    )

    resolveKeypair({
      publicKey: "pub",
      privateKeyCiphertext: "ct",
      privateKeyNonce: "nonce",
      privateKeySalt: "salt",
    })
  })
})
