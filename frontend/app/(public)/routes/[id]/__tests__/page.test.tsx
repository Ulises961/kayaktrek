import { describe, it, expect, vi, afterEach } from "vitest"
import { render, screen } from "@testing-library/react"

const { fetchPublicItineraryDetail, fetchItineraries, getSession } = vi.hoisted(() => ({
  fetchPublicItineraryDetail: vi.fn(),
  fetchItineraries: vi.fn(),
  getSession: vi.fn(),
}))
vi.mock("@/lib/itinerary/actions", () => ({ fetchPublicItineraryDetail, fetchItineraries }))
vi.mock("@/lib/auth/session", () => ({ getSession }))
// The page renders getMe() for the viewer's unit preference, and getMe reads the auth
// cookies directly to tell an anonymous visitor (normal on a public page) from a dead
// session. Outside a request scope next/headers throws, so stand it in as "no cookies".
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }))
vi.mock("@/components/map/map-loader", () => ({ default: () => <div data-testid="map" /> }))
vi.mock("@/components/explore/route-detail-actions", () => ({
  RouteDetailActions: () => <div data-testid="actions" />,
}))

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

  it("sends an anonymous visitor's back link home, not to the auth-gated /explore", async () => {
    // Regression: /explore is cookie-gated (proxy.ts), but this page is in the
    // (public) group and reachable without a session. A hardcoded backHref="/explore"
    // sent anonymous visitors into a login redirect instead of back — the exact kind
    // of dead end that forces someone to fall back to the browser's back button.
    fetchPublicItineraryDetail.mockResolvedValue(DETAIL)
    fetchItineraries.mockResolvedValue([])
    getSession.mockResolvedValue(null)

    const jsx = await PublicRoutePage({
      params: Promise.resolve({ id: "01952f1a-0000-7000-8000-000000000r01" }),
    })
    render(jsx)

    const link = screen.getByRole("link", { name: "Home" })
    expect(link).toHaveAttribute("href", "/")
  })

  it("sends a logged-in visitor's back link to /explore", async () => {
    fetchPublicItineraryDetail.mockResolvedValue(DETAIL)
    fetchItineraries.mockResolvedValue([])
    getSession.mockResolvedValue({ userId: "01952f1a-0000-7000-8000-000000000u01" })

    const jsx = await PublicRoutePage({
      params: Promise.resolve({ id: "01952f1a-0000-7000-8000-000000000r01" }),
    })
    render(jsx)

    const link = screen.getByRole("link", { name: "All routes" })
    expect(link).toHaveAttribute("href", "/explore")
  })
})
