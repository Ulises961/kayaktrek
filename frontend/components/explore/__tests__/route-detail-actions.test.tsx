import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

const mockPush = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mockPush }) }))
vi.mock("@/lib/itinerary/actions", () => ({ forkItinerary: vi.fn() }))
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }))

import { forkItinerary } from "@/lib/itinerary/actions"
import { toast } from "sonner"
import { RouteDetailActions } from "../route-detail-actions"

const mockFork = vi.mocked(forkItinerary)
const ID = "01952f1a-0000-7000-8000-000000000010"

beforeEach(() => vi.clearAllMocks())

describe("RouteDetailActions", () => {
  it("offers the owner a link to open their existing route", () => {
    render(<RouteDetailActions itineraryId={ID} isAuthenticated isOwner />)
    expect(screen.getByRole("link", { name: /open your route/i })).toHaveAttribute(
      "href",
      `/itinerary/${ID}`,
    )
    expect(screen.queryByRole("button", { name: /use this route/i })).not.toBeInTheDocument()
  })

  it("offers an authenticated non-owner the fork action", () => {
    render(<RouteDetailActions itineraryId={ID} isAuthenticated isOwner={false} />)
    expect(screen.getByRole("button", { name: /^use this route$/i })).toBeInTheDocument()
    expect(screen.queryByRole("link", { name: /open your route/i })).not.toBeInTheDocument()
  })

  it("prompts an anonymous visitor to log in", () => {
    render(<RouteDetailActions itineraryId={ID} isAuthenticated={false} isOwner={false} />)
    expect(screen.getByRole("button", { name: /log in to use this route/i })).toBeInTheDocument()
  })

  it("redirects an anonymous visitor to /login instead of forking", async () => {
    render(<RouteDetailActions itineraryId={ID} isAuthenticated={false} isOwner={false} />)
    await userEvent.click(screen.getByRole("button", { name: /log in to use this route/i }))
    expect(mockPush).toHaveBeenCalledWith("/login")
    expect(mockFork).not.toHaveBeenCalled()
  })

  it("shows an error toast and does not navigate when forking fails", async () => {
    mockFork.mockResolvedValue({ success: false, error: "Could not fork this route." })
    render(<RouteDetailActions itineraryId={ID} isAuthenticated isOwner={false} />)

    await userEvent.click(screen.getByRole("button", { name: /^use this route$/i }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Could not fork this route."))
    expect(mockPush).not.toHaveBeenCalled()
    // The button stays available for a retry — it isn't stuck disabled/hidden.
    expect(screen.getByRole("button", { name: /^use this route$/i })).toBeEnabled()
  })

  it("navigates to the forked itinerary on success", async () => {
    mockFork.mockResolvedValue({ success: true, itineraryId: "new-id" })
    render(<RouteDetailActions itineraryId={ID} isAuthenticated isOwner={false} />)

    await userEvent.click(screen.getByRole("button", { name: /^use this route$/i }))
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/itinerary/new-id"))
    expect(toast.error).not.toHaveBeenCalled()
  })
})
