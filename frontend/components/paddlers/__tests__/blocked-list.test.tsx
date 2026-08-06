import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

const mockRefresh = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mockRefresh }) }))

vi.mock("@/lib/blocks/actions", () => ({ unblockPaddler: vi.fn() }))

import { unblockPaddler } from "@/lib/blocks/actions"
import { BlockedList } from "../blocked-list"
import type { Block } from "@/lib/dtos/block"

const BLOCK: Block = {
  id: "01952f1a-0000-7000-8000-0000000000bb",
  created: null,
  blocked: {
    id: "01952f1a-0000-7000-8000-000000000002",
    username: "bob",
    name: "Bob",
    surname: null,
    avatarUrl: null,
  },
}

beforeEach(() => vi.clearAllMocks())

describe("BlockedList", () => {
  it("shows an empty message when nobody is blocked", () => {
    render(<BlockedList blocks={[]} />)
    expect(screen.getByText(/haven't blocked anyone/i)).toBeDefined()
  })

  it("lists a blocked paddler and unblocks by id", async () => {
    vi.mocked(unblockPaddler).mockResolvedValue({ success: true })
    render(<BlockedList blocks={[BLOCK]} />)

    expect(screen.getByText("Bob")).toBeDefined()
    await userEvent.click(screen.getByRole("button", { name: /unblock/i }))
    await waitFor(() =>
      expect(unblockPaddler).toHaveBeenCalledWith("01952f1a-0000-7000-8000-0000000000bb"),
    )
  })

  it("surfaces an error when unblock fails", async () => {
    vi.mocked(unblockPaddler).mockResolvedValue({ success: false, error: "Nope" })
    render(<BlockedList blocks={[BLOCK]} />)

    await userEvent.click(screen.getByRole("button", { name: /unblock/i }))
    await waitFor(() => expect(screen.getByText("Nope")).toBeDefined())
  })

  it("calls refresh() on successful unblock", async () => {
    vi.mocked(unblockPaddler).mockResolvedValue({ success: true })
    render(<BlockedList blocks={[BLOCK]} />)

    await userEvent.click(screen.getByRole("button", { name: /unblock/i }))
    await waitFor(() => expect(mockRefresh).toHaveBeenCalled())
  })
})
