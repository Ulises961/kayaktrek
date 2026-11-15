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
  await user.type(screen.getByLabelText(/confirm email/i), "a@b.com")
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

  describe("email confirmation", () => {
    const keypair = {
      publicKey: "pub",
      privateKeyCiphertext: "ct",
      privateKeyNonce: "nonce",
      privateKeySalt: "salt",
    }

    it("does not submit when the two addresses differ, and says why next to the field", async () => {
      const user = userEvent.setup()
      vi.mocked(generateKeypair).mockResolvedValue(keypair)

      render(<RegisterForm inviteCodeRequired={false} />)
      await user.type(screen.getByLabelText(/^email$/i), "kayaker@gmail.com")
      await user.type(screen.getByLabelText(/confirm email/i), "kayker@gmail.com")
      await user.type(screen.getByLabelText(/username/i), "kayaker")
      await user.type(screen.getByLabelText(/^password$/i), "Expedition#24")
      await user.click(screen.getByRole("button", { name: /create account/i }))

      expect(await screen.findByText("The email addresses do not match.")).toBeInTheDocument()
      expect(registerAction).not.toHaveBeenCalled()
      expect(generateKeypair).not.toHaveBeenCalled()
    })

    it("accepts the same address typed with different capitalisation", async () => {
      const user = userEvent.setup()
      vi.mocked(generateKeypair).mockResolvedValue(keypair)
      vi.mocked(registerAction).mockResolvedValue({ success: true })

      render(<RegisterForm inviteCodeRequired={false} />)
      await user.type(screen.getByLabelText(/^email$/i), "Kayaker@Gmail.com")
      await user.type(screen.getByLabelText(/confirm email/i), "kayaker@gmail.com")
      await user.type(screen.getByLabelText(/username/i), "kayaker")
      await user.type(screen.getByLabelText(/^password$/i), "Expedition#24")
      await user.click(screen.getByRole("button", { name: /create account/i }))

      await waitFor(() => expect(registerAction).toHaveBeenCalled())
    })

    it("sends only the address, never the confirmation copy, to the server", async () => {
      const user = userEvent.setup()
      vi.mocked(generateKeypair).mockResolvedValue(keypair)
      vi.mocked(registerAction).mockResolvedValue({ success: true })

      render(<RegisterForm inviteCodeRequired={false} />)
      await fillRequiredFields(user)
      await user.click(screen.getByRole("button", { name: /create account/i }))

      await waitFor(() => expect(registerAction).toHaveBeenCalled())
      const [, formData] = vi.mocked(registerAction).mock.calls[0]
      expect((formData as FormData).get("mail")).toBe("a@b.com")
      expect((formData as FormData).has("confirmMail")).toBe(false)
    })
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
