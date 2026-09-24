import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"

const { searchPublicItineraries, getViewer, hasLiveSession } = vi.hoisted(() => ({
  searchPublicItineraries: vi.fn(),
  getViewer: vi.fn(),
  hasLiveSession: vi.fn(),
}))
vi.mock("@/lib/itinerary/actions", () => ({ searchPublicItineraries }))
vi.mock("@/lib/user/me", () => ({ getViewer, hasLiveSession }))
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  }),
}))
vi.mock("@/components/explore/explore-discovery", () => ({
  ExploreDiscovery: () => <div data-testid="library" />,
}))
// Shell plumbing: it renders nothing and only tells the (app) layout to drop its centred
// column, so outside that layout it has no provider to talk to and nothing to assert.
vi.mock("@/components/common/content-layout", () => ({ ContentLayout: () => null }))

import { redirect } from "next/navigation"
import ExplorePage from "../page"

const EMPTY_PAGE = { items: [], total: 0, page: 1, pages: 1 }

describe("ExplorePage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    searchPublicItineraries.mockResolvedValue(EMPTY_PAGE)
  })

  // The library has two renders — the chart-framed anonymous one on `/`, and this one
  // inside the app shell. Serving both to a signed-out visitor gave them the shell with
  // a one-item sidebar and put the same listing on two indexable URLs, so the signed-out
  // half of this route now defers to the root that M23 made the front door.
  it("sends a visitor with no session to the root, which IS the anonymous library", async () => {
    hasLiveSession.mockResolvedValue(false)
    getViewer.mockResolvedValue(null)

    await expect(ExplorePage()).rejects.toThrow("NEXT_REDIRECT:/")
    expect(redirect).toHaveBeenCalledWith("/")
  })

  // The distinction that makes this a redirect and not a gate. /explore is deliberately
  // absent from proxy.ts's AUTH_GATED_PREFIXES, and sending an anonymous visitor to a
  // login form is the dead end M23 §1 closed — it has been reintroduced twice.
  it("never sends an anonymous visitor to /login", async () => {
    hasLiveSession.mockResolvedValue(false)
    getViewer.mockResolvedValue(null)

    await expect(ExplorePage()).rejects.toThrow()
    expect(redirect).not.toHaveBeenCalledWith("/login")
  })

  it("does not fetch the library it is about to redirect away from", async () => {
    hasLiveSession.mockResolvedValue(false)
    getViewer.mockResolvedValue(null)

    await expect(ExplorePage()).rejects.toThrow()
    expect(searchPublicItineraries).not.toHaveBeenCalled()
  })

  it("renders the library in the app shell for a signed-in visitor", async () => {
    hasLiveSession.mockResolvedValue(true)
    getViewer.mockResolvedValue({ unitPreference: "nm" })

    render(await ExplorePage())

    expect(redirect).not.toHaveBeenCalled()
    expect(screen.getByRole("heading", { name: /explore routes/i })).toBeVisible()
    expect(screen.getByTestId("library")).toBeVisible()
  })

  // hasLiveSession, not `getViewer() !== null`: a 500 from /api/user/me is a failed fetch,
  // not a verdict on the session. Reading the viewer would throw a signed-in paddler out
  // of the app over a transient upstream error.
  it("keeps a signed-in visitor whose /me call merely failed inside the shell", async () => {
    hasLiveSession.mockResolvedValue(true)
    getViewer.mockResolvedValue(null)

    render(await ExplorePage())

    expect(redirect).not.toHaveBeenCalled()
    expect(screen.getByTestId("library")).toBeVisible()
  })
})
