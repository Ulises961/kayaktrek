import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"

const { searchPublicItineraries, hasLiveSession } = vi.hoisted(() => ({
  searchPublicItineraries: vi.fn(),
  hasLiveSession: vi.fn(),
}))
vi.mock("@/lib/itinerary/actions", () => ({ searchPublicItineraries }))
vi.mock("@/lib/user/me", () => ({ hasLiveSession }))
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`)
  }),
}))
vi.mock("@/components/landing/landing-explore", () => ({
  LandingExplore: () => <div data-testid="landing-library" />,
}))

import { redirect } from "next/navigation"
import LandingPage from "../page"

const EMPTY_PAGE = { items: [], total: 0, page: 1, pages: 1 }

describe("LandingPage", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    searchPublicItineraries.mockResolvedValue(EMPTY_PAGE)
  })

  // hasLiveSession is the predicate, not "is there a cookie" — and it has to be the same
  // one /explore reads, because the two now redirect at each other. A revoked device or a
  // 30-day-expired refresh token still presents an unexpired-looking access_token, which
  // the old getSession() counted as a session: that visitor would ricochet /explore → /
  // → /dashboard → /login rather than simply being shown the public library. The three
  // credential states themselves are covered in lib/user/__tests__/me.test.ts.
  it("is the route library for anyone the app cannot recognise", async () => {
    hasLiveSession.mockResolvedValue(false)

    render(await LandingPage())

    expect(redirect).not.toHaveBeenCalled()
    expect(screen.getByTestId("landing-library")).toBeVisible()
  })

  it("sends a signed-in visitor on to their dashboard", async () => {
    hasLiveSession.mockResolvedValue(true)

    await expect(LandingPage()).rejects.toThrow("NEXT_REDIRECT:/dashboard")
    expect(redirect).toHaveBeenCalledWith("/dashboard")
  })

  it("does not fetch the library it is about to redirect away from", async () => {
    hasLiveSession.mockResolvedValue(true)

    await expect(LandingPage()).rejects.toThrow()
    expect(searchPublicItineraries).not.toHaveBeenCalled()
  })
})
