import { describe, it, expect, vi, afterEach } from "vitest"
import { render, screen } from "@testing-library/react"

const { fetchPublicItineraryDetail, fetchItineraries, hasLiveSession } = vi.hoisted(() => ({
  fetchPublicItineraryDetail: vi.fn(),
  fetchItineraries: vi.fn(),
  hasLiveSession: vi.fn(),
}))
vi.mock("@/lib/itinerary/actions", () => ({ fetchPublicItineraryDetail, fetchItineraries }))
// getViewer is left real: it reads the auth cookies directly to tell an anonymous visitor
// (normal on a public page) from a dead session, and outside a request scope next/headers
// throws — so stand the cookies in as "none" rather than mocking the accessor away.
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }))
vi.mock("@/lib/user/me", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/user/me")>()),
  hasLiveSession,
}))
vi.mock("@/components/map/map-loader", () => ({ default: () => <div data-testid="map" /> }))
vi.mock("@/components/explore/route-detail-actions", () => ({
  RouteDetailActions: () => <div data-testid="actions" />,
}))
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND")
  }),
}))

import { notFound } from "next/navigation"
import PublicRoutePage from "../page"

const DETAIL = {
  id: "01952f1a-0000-7000-8000-000000000r01",
  name: "Aegean loop",
  isPublic: true,
  totalMiles: 42.5,
  days: [],
}

describe("PublicRoutePage", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it("sends a visitor with no usable session back to the root, their copy of the library", async () => {
    // This page is reachable without a session, but /explore now redirects anyone the
    // app cannot recognise to `/`. Sending them to /explore would still arrive, just
    // via a pointless bounce — and before that redirect existed it was a login wall.
    fetchPublicItineraryDetail.mockResolvedValue(DETAIL)
    fetchItineraries.mockResolvedValue([])
    hasLiveSession.mockResolvedValue(false)

    const jsx = await PublicRoutePage({
      params: Promise.resolve({ id: "01952f1a-0000-7000-8000-000000000r01" }),
    })
    render(jsx)

    const link = screen.getByRole("link", { name: "Home" })
    expect(link).toHaveAttribute("href", "/")
  })

  // hasLiveSession, not "is there a cookie": a revoked device still carries an
  // unexpired-looking access_token. Reading mere existence spent a request on an
  // ownership check that can only 401, to decide between two actions both of which
  // would have bounced the visitor to /login.
  it("does not spend an ownership check on credentials the API cannot use", async () => {
    fetchPublicItineraryDetail.mockResolvedValue(DETAIL)
    hasLiveSession.mockResolvedValue(false)

    const jsx = await PublicRoutePage({
      params: Promise.resolve({ id: "01952f1a-0000-7000-8000-000000000r01" }),
    })
    render(jsx)

    expect(fetchItineraries).not.toHaveBeenCalled()
  })

  it("sends a logged-in visitor's back link to /explore", async () => {
    fetchPublicItineraryDetail.mockResolvedValue(DETAIL)
    fetchItineraries.mockResolvedValue([])
    hasLiveSession.mockResolvedValue(true)

    const jsx = await PublicRoutePage({
      params: Promise.resolve({ id: "01952f1a-0000-7000-8000-000000000r01" }),
    })
    render(jsx)

    const link = screen.getByRole("link", { name: "All routes" })
    expect(link).toHaveAttribute("href", "/explore")
  })

  it("404s when the route does not exist or is not public", async () => {
    fetchPublicItineraryDetail.mockResolvedValue(null)
    fetchItineraries.mockResolvedValue([])
    hasLiveSession.mockResolvedValue(false)

    await expect(
      PublicRoutePage({
        params: Promise.resolve({ id: "01952f1a-0000-7000-8000-000000000r01" }),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND")
    expect(notFound).toHaveBeenCalled()
  })
})
