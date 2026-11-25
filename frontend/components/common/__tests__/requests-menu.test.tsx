import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { act, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

const { mockRefresh, mockPathname, mockPoll } = vi.hoisted(() => ({
  mockRefresh: vi.fn(),
  mockPathname: vi.fn(() => "/dashboard"),
  mockPoll: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
  usePathname: mockPathname,
}))
vi.mock("@/lib/requests/poll", () => ({ refreshPendingRequests: mockPoll }))

import { PENDING_REQUESTS_POLL_MS } from "@/hooks/use-pending-requests"
import { RequestsMenu } from "../requests-menu"

function renderMenu(pendingRequests: {
  tripInvitations: number
  buddyRequests: number
  endorsementRequests: number
}) {
  return render(<RequestsMenu pendingRequests={pendingRequests} />)
}

beforeEach(() => {
  mockRefresh.mockReset()
  mockPathname.mockReturnValue("/dashboard")
  mockPoll.mockReset()
  mockPoll.mockResolvedValue(null)
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
    mockPoll.mockResolvedValue({ tripInvitations: 0, buddyRequests: 1, endorsementRequests: 0 })
    renderMenu({ tripInvitations: 0, buddyRequests: 0, endorsementRequests: 0 })
    expect(screen.queryByText("1")).not.toBeInTheDocument()

    await pollOnce()

    expect(screen.getByText("1")).toBeInTheDocument()
  })

  it("clears the badge when the last request is dealt with elsewhere", async () => {
    mockPoll.mockResolvedValue({ tripInvitations: 0, buddyRequests: 0, endorsementRequests: 0 })
    renderMenu({ tripInvitations: 2, buddyRequests: 0, endorsementRequests: 0 })
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
      mockPoll.mockResolvedValue({ tripInvitations: 1, buddyRequests: 0, endorsementRequests: 0 })
      renderMenu({ tripInvitations: 0, buddyRequests: 0, endorsementRequests: 0 })

      await pollOnce()

      expect(mockRefresh).toHaveBeenCalledTimes(1)
    },
  )

  it("leaves other pages alone when the counts change", async () => {
    mockPathname.mockReturnValue("/trips/abc")
    mockPoll.mockResolvedValue({ tripInvitations: 1, buddyRequests: 0, endorsementRequests: 0 })
    renderMenu({ tripInvitations: 0, buddyRequests: 0, endorsementRequests: 0 })

    await pollOnce()

    expect(screen.getByText("1")).toBeInTheDocument()
    expect(mockRefresh).not.toHaveBeenCalled()
  })

  it("does not refresh when the poll finds nothing new", async () => {
    mockPoll.mockResolvedValue({ tripInvitations: 1, buddyRequests: 0, endorsementRequests: 0 })
    renderMenu({ tripInvitations: 1, buddyRequests: 0, endorsementRequests: 0 })

    await pollOnce()

    expect(mockRefresh).not.toHaveBeenCalled()
  })
})

describe("RequestsMenu", () => {
  it("shows no count badge when there are no pending requests", () => {
    renderMenu({ tripInvitations: 0, buddyRequests: 0, endorsementRequests: 0 })
    expect(screen.queryByText("0")).not.toBeInTheDocument()
  })

  it("shows the combined count as a badge", () => {
    renderMenu({ tripInvitations: 2, buddyRequests: 1, endorsementRequests: 0 })
    expect(screen.getByText("3")).toBeInTheDocument()
  })

  it("lists only nonzero request types, each linking to its home page", async () => {
    renderMenu({ tripInvitations: 2, buddyRequests: 0, endorsementRequests: 1 })
    await userEvent.click(screen.getByRole("button", { name: /pending requests/i }))

    const tripLink = await screen.findByRole("menuitem", { name: /2 trip invitations/i })
    expect(tripLink.closest("a")).toHaveAttribute("href", "/invitations")

    const endorsementLink = screen.getByRole("menuitem", { name: /1 endorsement request/i })
    expect(endorsementLink.closest("a")).toHaveAttribute("href", "/logs")

    expect(screen.queryByText(/buddy request/i)).not.toBeInTheDocument()
  })

  it("shows a 'no pending requests' row when everything is zero", async () => {
    renderMenu({ tripInvitations: 0, buddyRequests: 0, endorsementRequests: 0 })
    await userEvent.click(screen.getByRole("button", { name: /pending requests/i }))
    expect(await screen.findByText(/no pending requests/i)).toBeInTheDocument()
  })
})
