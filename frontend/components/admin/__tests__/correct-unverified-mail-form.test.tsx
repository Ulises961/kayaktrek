import { describe, it, expect, vi, afterEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { CorrectUnverifiedMailForm } from "../correct-unverified-mail-form"
import { correctUnverifiedMail } from "@/lib/admin/actions"

vi.mock("@/lib/admin/actions", () => ({
  correctUnverifiedMail: vi.fn(),
}))

async function submit(user: ReturnType<typeof userEvent.setup>, username: string, newMail: string) {
  await user.type(screen.getByLabelText(/^username$/i), username)
  await user.type(screen.getByLabelText(/correct email address/i), newMail)
  await user.click(screen.getByRole("button", { name: /move account and send link/i }))
}

describe("CorrectUnverifiedMailForm", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it("sends the username and the corrected address", async () => {
    const user = userEvent.setup()
    vi.mocked(correctUnverifiedMail).mockResolvedValue({
      success: true,
      username: "kayaker",
      mail: "right@example.com",
    })
    render(<CorrectUnverifiedMailForm />)

    await submit(user, "kayaker", "right@example.com")

    await waitFor(() => expect(correctUnverifiedMail).toHaveBeenCalled())
    const [, formData] = vi.mocked(correctUnverifiedMail).mock.calls[0]
    expect((formData as FormData).get("username")).toBe("kayaker")
    expect((formData as FormData).get("newMail")).toBe("right@example.com")
  })

  it("shows where the link went and for whom, using the address as stored", async () => {
    const user = userEvent.setup()
    vi.mocked(correctUnverifiedMail).mockResolvedValue({
      success: true,
      username: "kayaker",
      mail: "right@example.com",
    })
    render(<CorrectUnverifiedMailForm />)

    await submit(user, "kayaker", "Right@Example.com")

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Verification link sent to right@example.com for kayaker.",
    )
  })

  it("does not submit a malformed address", async () => {
    const user = userEvent.setup()
    render(<CorrectUnverifiedMailForm />)

    await submit(user, "kayaker", "not-an-address")

    expect(await screen.findByText("Enter a valid email address.")).toBeInTheDocument()
    expect(correctUnverifiedMail).not.toHaveBeenCalled()
  })

  it("does not submit without a username", async () => {
    const user = userEvent.setup()
    render(<CorrectUnverifiedMailForm />)

    await user.type(screen.getByLabelText(/correct email address/i), "right@example.com")
    await user.click(screen.getByRole("button", { name: /move account and send link/i }))

    expect(await screen.findByText("Username is required.")).toBeInTheDocument()
    expect(correctUnverifiedMail).not.toHaveBeenCalled()
  })

  it("shows the backend's refusal and leaves the form usable for another try", async () => {
    const user = userEvent.setup()
    vi.mocked(correctUnverifiedMail).mockResolvedValue({
      success: false,
      error: "That address belongs to another account",
    })
    render(<CorrectUnverifiedMailForm />)

    await submit(user, "kayaker", "taken@example.com")

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "That address belongs to another account",
    )
    expect(screen.queryByRole("status")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: /move account and send link/i })).toBeEnabled()
  })
})
