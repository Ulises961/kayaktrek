import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { act, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

const { mockRefresh, mockPathname, mockPoll, mockMarkRead } = vi.hoisted(() => ({
  mockRefresh: vi.fn(),
  mockPathname: vi.fn(() => "/dashboard"),
  mockPoll: vi.fn(),
  mockMarkRead: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
  usePathname: mockPathname,
}))
vi.mock("@/lib/requests/poll", () => ({ refreshPendingRequests: mockPoll }))
vi.mock("@/lib/requests/mutations", () => ({ markNotificationsRead: mockMarkRead }))

import { PENDING_REQUESTS_POLL_MS } from "@/hooks/use-pending-requests"
import { NOTIFICATION_KIND } from "@/lib/dtos/pending-requests"
import { EMPTY_PENDING_SUMMARY, type PendingRequestsSummary } from "@/lib/requests/pending"
import { RequestsMenu } from "../requests-menu"

// A full summary from just the counts a test cares about.
function counts(overrides: Partial<PendingRequestsSummary>): PendingRequestsSummary {
  return { ...EMPTY_PENDING_SUMMARY, ...overrides }
}

function renderMenu(pendingRequests: Partial<PendingRequestsSummary>) {
  return render(<RequestsMenu pendingRequests={counts(pendingRequests)} />)
}

beforeEach(() => {
  mockRefresh.mockReset()
  mockPathname.mockReturnValue("/dashboard")
  mockPoll.mockReset()
  mockPoll.mockResolvedValue(null)
  mockMarkRead.mockReset()
  mockMarkRead.mockResolvedValue({ success: true })
})

describe("RequestsMenu — live badge", () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  async function pollOnce() {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(PENDING_REQUESTS_POLL_MS)
    })
  }

  it("raises the badge when a request arrives while the page is open", async () => {
    mockPoll.mockResolvedValue(counts({ buddyRequests: 1 }))
    renderMenu({})
    expect(screen.queryByText("1")).not.toBeInTheDocument()

    await pollOnce()

    expect(screen.getByText("1")).toBeInTheDocument()
  })

  it("clears the badge when the last request is dealt with elsewhere", async () => {
    mockPoll.mockResolvedValue(counts({}))
    renderMenu({ tripInvitations: 2 })
    expect(screen.getByText("2")).toBeInTheDocument()

    await pollOnce()

    expect(screen.queryByText("2")).not.toBeInTheDocument()
  })

  // The dashboard, /invitations, /paddlers and /logs list the requests themselves, so a new one
  // has to reach the list as well as the badge.
  it.each(["/dashboard", "/invitations", "/paddlers", "/logs"])(
    "refreshes %s when the counts change, so its list shows the new request",
    async (path) => {
      mockPathname.mockReturnValue(path)
      mockPoll.mockResolvedValue(counts({ tripInvitations: 1 }))
      renderMenu({})

      await pollOnce()

      expect(mockRefresh).toHaveBeenCalledTimes(1)
    },
  )

  // The sender's side: someone accepted what the user sent. It arrives as a notification in the
  // same bell, so the badge rises, and the buddies page, which lists the request, moves with it.
  it("raises the badge when a buddy request the user sent is accepted, and refreshes the buddies page", async () => {
    mockPathname.mockReturnValue("/paddlers")
    mockPoll.mockResolvedValue(counts({ acceptedBuddyRequests: 1 }))
    renderMenu({})

    await pollOnce()

    expect(screen.getByText("1")).toBeInTheDocument()
    expect(mockRefresh).toHaveBeenCalledTimes(1)
  })

  // The inviter is on the trip's Crew tab with the invitee still listed as pending. The
  // acceptance arrives as a notification, and the page has to reload so the entry goes.
  it("refreshes a trip's crew page when an invitation to it is accepted", async () => {
    mockPathname.mockReturnValue("/trips/abc/crew")
    mockPoll.mockResolvedValue(counts({ acceptedTripInvitations: 1 }))
    renderMenu({})

    await pollOnce()

    expect(screen.getByText("1")).toBeInTheDocument()
    expect(mockRefresh).toHaveBeenCalledTimes(1)
  })

  it("counts answers to the user's own requests in the badge with what is waiting on them", () => {
    renderMenu({ tripInvitations: 1, acceptedTripInvitations: 2, acceptedBuddyRequests: 1 })

    expect(screen.getByText("4")).toBeInTheDocument()
  })

  it("leaves other pages alone when the counts change", async () => {
    mockPathname.mockReturnValue("/trips/abc")
    mockPoll.mockResolvedValue(counts({ tripInvitations: 1 }))
    renderMenu({})

    await pollOnce()

    expect(screen.getByText("1")).toBeInTheDocument()
    expect(mockRefresh).not.toHaveBeenCalled()
  })

  it("does not refresh when the poll finds nothing new", async () => {
    mockPoll.mockResolvedValue(counts({ tripInvitations: 1 }))
    renderMenu({ tripInvitations: 1 })

    await pollOnce()

    expect(mockRefresh).not.toHaveBeenCalled()
  })
})

describe("RequestsMenu", () => {
  it("shows no count badge when there are no pending requests", () => {
    renderMenu({})
    expect(screen.queryByText("0")).not.toBeInTheDocument()
  })

  it("shows the combined count as a badge", () => {
    renderMenu({ tripInvitations: 2, buddyRequests: 1 })
    expect(screen.getByText("3")).toBeInTheDocument()
  })

  it("lists only nonzero request types, each linking to its home page", async () => {
    renderMenu({ tripInvitations: 2, endorsementRequests: 1 })
    await userEvent.click(screen.getByRole("button", { name: /pending requests/i }))

    const tripLink = await screen.findByRole("menuitem", { name: /2 trip invitations/i })
    expect(tripLink.closest("a")).toHaveAttribute("href", "/invitations")

    const endorsementLink = screen.getByRole("menuitem", { name: /1 endorsement request/i })
    expect(endorsementLink.closest("a")).toHaveAttribute("href", "/logs")

    expect(screen.queryByText(/buddy request/i)).not.toBeInTheDocument()
  })

  describe("answers to the user's own requests", () => {
    it("lists an accepted trip invitation and an accepted buddy request, each linking to its page", async () => {
      renderMenu({ acceptedTripInvitations: 2, acceptedBuddyRequests: 1 })
      await userEvent.click(screen.getByRole("button", { name: /pending requests/i }))

      const trips = await screen.findByRole("menuitem", { name: /2 trip invitations accepted/i })
      expect(trips.closest("a")).toHaveAttribute("href", "/trips")
      const buddies = screen.getByRole("menuitem", { name: /1 buddy request accepted/i })
      expect(buddies.closest("a")).toHaveAttribute("href", "/paddlers")
    })

    it("clears that kind when its row is opened, then refreshes so the badge comes down", async () => {
      mockMarkRead.mockResolvedValue({ success: true })
      renderMenu({ acceptedBuddyRequests: 1 })
      await userEvent.click(screen.getByRole("button", { name: /pending requests/i }))

      await userEvent.click(
        await screen.findByRole("menuitem", { name: /buddy request accepted/i }),
      )

      expect(mockMarkRead).toHaveBeenCalledWith(NOTIFICATION_KIND.BUDDY_REQUEST_ACCEPTED)
      await vi.waitFor(() => expect(mockRefresh).toHaveBeenCalled())
    })

    it("does not try to clear a row that asks for an answer rather than reporting one", async () => {
      renderMenu({ buddyRequests: 1 })
      await userEvent.click(screen.getByRole("button", { name: /pending requests/i }))

      await userEvent.click(await screen.findByRole("menuitem", { name: /1 buddy request/i }))

      expect(mockMarkRead).not.toHaveBeenCalled()
    })
  })

  it("shows a 'no pending requests' row when everything is zero", async () => {
    renderMenu({})
    await userEvent.click(screen.getByRole("button", { name: /pending requests/i }))
    expect(await screen.findByText(/no pending requests/i)).toBeInTheDocument()
  })
})
