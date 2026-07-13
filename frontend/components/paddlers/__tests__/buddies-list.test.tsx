import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

const mockRefresh = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mockRefresh }) }))

vi.mock("@/lib/connections/actions", () => ({
  acceptConnection: vi.fn(),
  removeConnection: vi.fn(),
}))

import { acceptConnection, removeConnection } from "@/lib/connections/actions"
import { BuddiesList } from "../buddies-list"
import type { Connection } from "@/lib/dtos/connection"

const ME = "01952f1a-0000-7000-8000-000000000001"
const ALICE = {
  id: "01952f1a-0000-7000-8000-00000000000a",
  username: "alice",
  name: "Alice",
  surname: null,
  avatarUrl: null,
}
const BOB = {
  id: "01952f1a-0000-7000-8000-00000000000b",
  username: "bob",
  name: "Bob",
  surname: null,
  avatarUrl: null,
}
const CARA = {
  id: "01952f1a-0000-7000-8000-00000000000c",
  username: "cara",
  name: "Cara",
  surname: null,
  avatarUrl: null,
}
const SELF = { id: ME, username: "me", name: "Me", surname: null, avatarUrl: null }

// Alice → me (incoming pending), me → Bob (outgoing pending), me ↔ Cara (buddy).
const CONNECTIONS: Connection[] = [
  {
    id: "01952f1a-0000-7000-8000-0000000000a1",
    status: "pending",
    created: null,
    respondedAt: null,
    requester: ALICE,
    addressee: SELF,
  },
  {
    id: "01952f1a-0000-7000-8000-0000000000b1",
    status: "pending",
    created: null,
    respondedAt: null,
    requester: SELF,
    addressee: BOB,
  },
  {
    id: "01952f1a-0000-7000-8000-0000000000c1",
    status: "accepted",
    created: null,
    respondedAt: null,
    requester: CARA,
    addressee: SELF,
  },
]

beforeEach(() => vi.clearAllMocks())

describe("BuddiesList", () => {
  it("shows an empty message when there are no connections", () => {
    render(<BuddiesList connections={[]} currentUserId={ME} />)
    expect(screen.getByText(/no buddies yet/i)).toBeDefined()
  })

  it("shows a search-specific empty message when filtered to zero by a search term", () => {
    render(<BuddiesList connections={[]} currentUserId={ME} searchTerm="zzz" />)
    expect(screen.queryByText(/no buddies yet/i)).toBeNull()
    expect(screen.getByText(/no buddies match/i)).toBeDefined()
    expect(screen.getByText(/zzz/i)).toBeDefined()
  })

  it("categorises incoming, outgoing and accepted connections", () => {
    render(<BuddiesList connections={CONNECTIONS} currentUserId={ME} />)
    expect(screen.getByText(/buddy requests \(1\)/i)).toBeDefined()
    expect(screen.getByText(/sent requests \(1\)/i)).toBeDefined()
    expect(screen.getByText(/^buddies \(1\)/i)).toBeDefined()
  })

  it("accepts an incoming request by connection id", async () => {
    vi.mocked(acceptConnection).mockResolvedValue({ success: true })
    render(<BuddiesList connections={CONNECTIONS} currentUserId={ME} />)

    await userEvent.click(screen.getByRole("button", { name: /accept/i }))
    await waitFor(() =>
      expect(acceptConnection).toHaveBeenCalledWith("01952f1a-0000-7000-8000-0000000000a1"),
    )
  })

  it("cancels an outgoing request", async () => {
    vi.mocked(removeConnection).mockResolvedValue({ success: true })
    render(<BuddiesList connections={CONNECTIONS} currentUserId={ME} />)

    await userEvent.click(screen.getByRole("button", { name: /cancel/i }))
    await waitFor(() =>
      expect(removeConnection).toHaveBeenCalledWith("01952f1a-0000-7000-8000-0000000000b1"),
    )
  })

  it("unfriends a buddy", async () => {
    vi.mocked(removeConnection).mockResolvedValue({ success: true })
    render(<BuddiesList connections={CONNECTIONS} currentUserId={ME} />)

    await userEvent.click(screen.getByRole("button", { name: /unfriend/i }))
    await waitFor(() =>
      expect(removeConnection).toHaveBeenCalledWith("01952f1a-0000-7000-8000-0000000000c1"),
    )
  })
})
