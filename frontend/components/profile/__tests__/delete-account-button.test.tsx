import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

vi.mock("@/lib/profile/actions", () => ({ requestAccountDeletion: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: vi.fn() }))

import { requestAccountDeletion } from "@/lib/profile/actions"
import { useRouter } from "next/navigation"
import { DeleteAccountButton } from "../delete-account-button"

const mockPush = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vi.mocked(useRouter).mockReturnValue({ push: mockPush } as any)
})

async function openDialog() {
  render(<DeleteAccountButton />)
  await userEvent.click(screen.getByRole("button", { name: /request account deletion/i }))
}

describe("DeleteAccountButton", () => {
  it("renders the trigger button", () => {
    render(<DeleteAccountButton />)
    expect(screen.getByRole("button", { name: /request account deletion/i })).toBeDefined()
  })

  it("opens a confirmation dialog on click", async () => {
    await openDialog()
    expect(screen.getByRole("dialog")).toBeDefined()
  })

  it("explains the 30-day grace period in the dialog", async () => {
    await openDialog()
    expect(screen.getAllByText(/30 days/i).length).toBeGreaterThan(0)
  })

  it("calls requestAccountDeletion when confirmed", async () => {
    vi.mocked(requestAccountDeletion).mockResolvedValue({ success: true })
    await openDialog()
    await userEvent.click(screen.getByRole("button", { name: /yes, delete my account/i }))

    await waitFor(() => expect(requestAccountDeletion).toHaveBeenCalledOnce())
  })

  it("redirects to /login after successful deletion request", async () => {
    vi.mocked(requestAccountDeletion).mockResolvedValue({ success: true })
    await openDialog()
    await userEvent.click(screen.getByRole("button", { name: /yes, delete my account/i }))

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/login?deleted=1"))
  })

  it("shows an error in the dialog when the request fails", async () => {
    vi.mocked(requestAccountDeletion).mockResolvedValue({ success: false, error: "Server error." })
    await openDialog()
    await userEvent.click(screen.getByRole("button", { name: /yes, delete my account/i }))

    await waitFor(() => expect(screen.getByText("Server error.")).toBeDefined())
  })

  it("closes the dialog without calling the action when cancelled", async () => {
    await openDialog()
    await userEvent.click(screen.getByRole("button", { name: /^cancel$/i }))

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(requestAccountDeletion).not.toHaveBeenCalled()
  })
})
