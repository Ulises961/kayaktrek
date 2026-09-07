import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { LandingExplore } from "../landing-explore"
import type { ExplorePage } from "@/lib/dtos/itinerary"

vi.mock("@/components/explore/explore-discovery", () => ({
  ExploreDiscovery: () => null,
}))
vi.mock("../discovery-intro", () => ({
  DiscoveryIntro: () => null,
}))

const emptyPage: ExplorePage = {
  items: [],
  page: 1,
  pages: 1,
  total: 0,
}

describe("LandingExplore", () => {
  it("links to About, Terms of Use and Privacy in the footer", () => {
    render(<LandingExplore initial={emptyPage} />)
    expect(screen.getByRole("link", { name: /^about$/i })).toHaveAttribute("href", "/about")
    expect(screen.getByRole("link", { name: /terms of use/i })).toHaveAttribute("href", "/terms")
    expect(screen.getByRole("link", { name: /^privacy$/i })).toHaveAttribute("href", "/privacy")
  })
})
