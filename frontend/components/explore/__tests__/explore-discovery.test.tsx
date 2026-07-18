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
import { DISTANCE_UNIT, formatDistance } from "@/lib/itinerary/distance"
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
    previewPositions: [],
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
    render(<ExploreDiscovery initial={page([item()])} isAuthenticated ownedIds={[]} />)
    expect(screen.getByText("Aegean loop")).toBeInTheDocument()
    expect(mockSearch).not.toHaveBeenCalled()
  })

  it("shows route distance in nm by default", () => {
    render(<ExploreDiscovery initial={page([item()])} isAuthenticated ownedIds={[]} />)
    expect(screen.getByText(`${formatDistance(20, DISTANCE_UNIT.NM)} nm`)).toBeInTheDocument()
  })

  it("converts route distance to km when unit is km", () => {
    render(
      <ExploreDiscovery
        initial={page([item()])}
        isAuthenticated
        ownedIds={[]}
        unit={DISTANCE_UNIT.KM}
      />,
    )
    expect(screen.getByText(`${formatDistance(20, DISTANCE_UNIT.KM)} km`)).toBeInTheDocument()
    expect(screen.queryByText(/20\.0 nm/)).not.toBeInTheDocument()
  })

  it("re-queries with the name filter when the user types", async () => {
    render(<ExploreDiscovery initial={page([item()])} isAuthenticated ownedIds={[]} />)
    await userEvent.type(screen.getByLabelText("Search routes by name"), "hebrides")
    await waitFor(() =>
      expect(mockSearch).toHaveBeenCalledWith(expect.objectContaining({ name: "hebrides" })),
    )
  })

  it("re-queries with the season filter when a chip is toggled", async () => {
    render(<ExploreDiscovery initial={page([item()])} isAuthenticated ownedIds={[]} />)
    await userEvent.click(screen.getByRole("button", { name: "winter" }))
    await waitFor(() =>
      expect(mockSearch).toHaveBeenCalledWith(expect.objectContaining({ seasons: ["winter"] })),
    )
  })

  it("appends the next page on Load more", async () => {
    mockSearch.mockResolvedValue(page([item({ id: "next", name: "Second route" })], { page: 2 }))
    render(
      <ExploreDiscovery
        initial={page([item()], { pages: 2, total: 2 })}
        isAuthenticated
        ownedIds={[]}
      />,
    )
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
        ownedIds={[]}
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
        ownedIds={[]}
      />,
    )
    expect(screen.getByText("Maren")).toBeInTheDocument()
    expect(screen.queryByRole("link", { name: "Maren" })).not.toBeInTheDocument()
  })

  it("offers to open — not fork — a route the viewer owns", () => {
    render(
      <ExploreDiscovery
        initial={page([item()])}
        isAuthenticated
        ownedIds={["01952f1a-0000-7000-8000-000000000010"]}
      />,
    )
    expect(screen.getByRole("link", { name: /open your route/i })).toHaveAttribute(
      "href",
      "/itinerary/01952f1a-0000-7000-8000-000000000010",
    )
    expect(screen.queryByRole("button", { name: /use this route/i })).not.toBeInTheDocument()
  })

  it("offers to fork a route the viewer does not own", () => {
    render(
      <ExploreDiscovery initial={page([item()])} isAuthenticated ownedIds={["some-other-id"]} />,
    )
    expect(screen.getByRole("button", { name: /use this route/i })).toBeInTheDocument()
    expect(screen.queryByRole("link", { name: /open your route/i })).not.toBeInTheDocument()
  })
})
