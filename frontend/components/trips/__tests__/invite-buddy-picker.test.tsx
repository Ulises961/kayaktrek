import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock("@/lib/connections/actions", () => ({ listConnections: vi.fn() }))
vi.mock("@/lib/trips/actions", () => ({ inviteBuddy: vi.fn() }))

import { listConnections } from "@/lib/connections/actions"
import { inviteBuddy } from "@/lib/trips/actions"
import { InviteBuddyPicker } from "../invite-buddy-picker"
import type { Connection } from "@/lib/dtos/connection"

const TRIP_ID = "01952f1a-0000-7000-8000-000000000010"
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
const SELF = { id: ME, username: "me", name: "Me", surname: null, avatarUrl: null }

const BUDDIES: Connection[] = [
  {
    id: "1",
    status: "accepted",
    created: null,
    respondedAt: null,
    requester: SELF,
    addressee: ALICE,
  },
  {
    id: "2",
    status: "accepted",
    created: null,
    respondedAt: null,
    requester: BOB,
    addressee: SELF,
  },
]

beforeEach(() => vi.clearAllMocks())

describe("InviteBuddyPicker", () => {
  it("lists buddies who are not already on the trip", async () => {
    vi.mocked(listConnections).mockResolvedValue(BUDDIES)
    // Alice is already crew, so only Bob should be offered.
    render(<InviteBuddyPicker tripId={TRIP_ID} currentUserId={ME} excludeUserIds={[ALICE.id]} />)

    await userEvent.click(screen.getByRole("button", { name: /invite a buddy/i }))
    expect(await screen.findByText(/Bob/)).toBeDefined()
    expect(screen.queryByText(/Alice/)).toBeNull()
  })

  it("invites the chosen buddy by id", async () => {
    vi.mocked(listConnections).mockResolvedValue(BUDDIES)
    vi.mocked(inviteBuddy).mockResolvedValue({ success: true })
    render(<InviteBuddyPicker tripId={TRIP_ID} currentUserId={ME} excludeUserIds={[]} />)

    await userEvent.click(screen.getByRole("button", { name: /invite a buddy/i }))
    await userEvent.click(await screen.findByText(/Bob/))
    await waitFor(() => expect(inviteBuddy).toHaveBeenCalledWith(TRIP_ID, BOB.id))
  })

  it("shows an error and keeps the buddy listed when invite fails", async () => {
    vi.mocked(listConnections).mockResolvedValue(BUDDIES)
    vi.mocked(inviteBuddy).mockResolvedValue({
      success: false,
      error: "You can't invite this paddler.",
    })
    render(<InviteBuddyPicker tripId={TRIP_ID} currentUserId={ME} excludeUserIds={[]} />)

    await userEvent.click(screen.getByRole("button", { name: /invite a buddy/i }))
    await userEvent.click(await screen.findByText(/Bob/))

    await waitFor(() =>
      expect(screen.getByText(/you can't invite this paddler/i)).toBeInTheDocument(),
    )
    // Not removed from the list — invite failed, so it stays available to retry.
    expect(screen.getByText(/Bob/)).toBeInTheDocument()
  })

  it("shows an empty message when no buddies are available", async () => {
    vi.mocked(listConnections).mockResolvedValue([])
    render(<InviteBuddyPicker tripId={TRIP_ID} currentUserId={ME} excludeUserIds={[]} />)

    await userEvent.click(screen.getByRole("button", { name: /invite a buddy/i }))
    expect(await screen.findByText(/no buddies available/i)).toBeDefined()
  })

  it("filters the buddy list as the user types", async () => {
    vi.mocked(listConnections).mockResolvedValue(BUDDIES)
    render(<InviteBuddyPicker tripId={TRIP_ID} currentUserId={ME} excludeUserIds={[]} />)

    await userEvent.click(screen.getByRole("button", { name: /invite a buddy/i }))
    await screen.findByText(/Bob/)
    await userEvent.type(screen.getByPlaceholderText(/search/i), "bob")
    expect(screen.getByText(/Bob/)).toBeInTheDocument()
    expect(screen.queryByText(/Alice/)).not.toBeInTheDocument()
  })

  it("shows a 'Find paddlers' link when the typed term matches no buddy", async () => {
    vi.mocked(listConnections).mockResolvedValue(BUDDIES)
    render(<InviteBuddyPicker tripId={TRIP_ID} currentUserId={ME} excludeUserIds={[]} />)

    await userEvent.click(screen.getByRole("button", { name: /invite a buddy/i }))
    await screen.findByText(/Bob/)
    await userEvent.type(screen.getByPlaceholderText(/search/i), "nobody-like-this")
    const link = await screen.findByRole("link", { name: /find paddlers/i })
    expect(link).toHaveAttribute("href", "/paddlers?q=nobody-like-this")
  })

  it("does not show the 'Find paddlers' link when the search is empty", async () => {
    vi.mocked(listConnections).mockResolvedValue(BUDDIES)
    render(<InviteBuddyPicker tripId={TRIP_ID} currentUserId={ME} excludeUserIds={[]} />)

    await userEvent.click(screen.getByRole("button", { name: /invite a buddy/i }))
    await screen.findByText(/Bob/)
    expect(screen.queryByRole("link", { name: /find paddlers/i })).not.toBeInTheDocument()
  })
})
