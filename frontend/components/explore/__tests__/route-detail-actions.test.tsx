import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock("@/lib/itinerary/actions", () => ({ forkItinerary: vi.fn() }))

import { RouteDetailActions } from "../route-detail-actions"

const ID = "01952f1a-0000-7000-8000-000000000010"

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
})
