import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock("@/lib/itinerary/actions", () => ({
  searchPublicItineraries: vi.fn(),
  fetchPublicRouteData: vi.fn().mockResolvedValue(null),
  forkItinerary: vi.fn(),
}))
// Stub the Leaflet map — react-leaflet does not run in jsdom.
vi.mock("@/components/explore/explore-discovery-map", () => ({
  default: () => <div data-testid="map" />,
}))

import { searchPublicItineraries } from "@/lib/itinerary/actions"
import { ExploreDiscovery } from "../explore-discovery"
import type { ExploreItem, ExplorePage } from "@/lib/dtos/itinerary"

const mockSearch = vi.mocked(searchPublicItineraries)

function item(overrides: Partial<ExploreItem> = {}): ExploreItem {
  return {
    id: "01952f1a-0000-7000-8000-000000000010",
    name: "Aegean loop",
    totalMiles: 20,
    dayCount: 3,
    season: "summer",
    centroidLat: 37,
    centroidLng: 25,
    createdFromId: null,
    originalAuthor: null,
    ...overrides,
  }
}

function page(items: ExploreItem[], overrides: Partial<ExplorePage> = {}): ExplorePage {
  return { items, total: items.length, page: 1, pages: 1, ...overrides }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockSearch.mockResolvedValue(page([]))
})

describe("ExploreDiscovery", () => {
  it("renders the initial routes without re-querying", () => {
    render(<ExploreDiscovery initial={page([item()])} isAuthenticated />)
    expect(screen.getByText("Aegean loop")).toBeInTheDocument()
    expect(mockSearch).not.toHaveBeenCalled()
  })

  it("re-queries with the name filter when the user types", async () => {
    render(<ExploreDiscovery initial={page([item()])} isAuthenticated />)
    await userEvent.type(screen.getByLabelText("Search routes by name"), "hebrides")
    await waitFor(() =>
      expect(mockSearch).toHaveBeenCalledWith(expect.objectContaining({ name: "hebrides" })),
    )
  })

  it("re-queries with the season filter when a chip is toggled", async () => {
    render(<ExploreDiscovery initial={page([item()])} isAuthenticated />)
    await userEvent.click(screen.getByRole("button", { name: "winter" }))
    await waitFor(() =>
      expect(mockSearch).toHaveBeenCalledWith(expect.objectContaining({ seasons: ["winter"] })),
    )
  })

  it("appends the next page on Load more", async () => {
    mockSearch.mockResolvedValue(page([item({ id: "next", name: "Second route" })], { page: 2 }))
    render(<ExploreDiscovery initial={page([item()], { pages: 2, total: 2 })} isAuthenticated />)
    await userEvent.click(screen.getByRole("button", { name: /load more/i }))
    await waitFor(() => expect(screen.getByText("Second route")).toBeInTheDocument())
    expect(screen.getByText("Aegean loop")).toBeInTheDocument()
  })

  it("links the attribution to a public author", () => {
    render(
      <ExploreDiscovery
        initial={page([
          item({
            createdFromId: "src",
            originalAuthor: { username: "seapaddler", name: "Maren", linkable: true },
          }),
        ])}
        isAuthenticated
      />,
    )
    expect(screen.getByRole("link", { name: "Maren" })).toHaveAttribute(
      "href",
      "/paddlers/seapaddler",
    )
  })

  it("does not link the attribution to a private author", () => {
    render(
      <ExploreDiscovery
        initial={page([
          item({
            createdFromId: "src",
            originalAuthor: { username: "seapaddler", name: "Maren", linkable: false },
          }),
        ])}
        isAuthenticated
      />,
    )
    expect(screen.getByText("Maren")).toBeInTheDocument()
    expect(screen.queryByRole("link", { name: "Maren" })).not.toBeInTheDocument()
  })
})
