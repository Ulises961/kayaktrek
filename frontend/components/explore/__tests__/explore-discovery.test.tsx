import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

const mockPush = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mockPush }) }))
vi.mock("@/lib/itinerary/actions", () => ({
  searchPublicItineraries: vi.fn(),
  fetchPublicRouteData: vi.fn().mockResolvedValue(null),
  forkItinerary: vi.fn(),
}))
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }))
// Stub the Leaflet map — react-leaflet does not run in jsdom.
vi.mock("@/components/explore/explore-discovery-map", () => ({
  default: () => <div data-testid="map" />,
}))

import { searchPublicItineraries, forkItinerary } from "@/lib/itinerary/actions"
import { toast } from "sonner"
import { ExploreDiscovery } from "../explore-discovery"
import { DISTANCE_UNIT, formatDistance } from "@/lib/itinerary/distance"
import type { ExploreItem, ExplorePage } from "@/lib/dtos/itinerary"
import { DIFFICULTY, DIFFICULTY_LABELS } from "@/lib/dtos/difficulty"

const mockSearch = vi.mocked(searchPublicItineraries)
const mockFork = vi.mocked(forkItinerary)

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
    description: null,
    difficulty: null,
    author: null,
    longestDayMiles: null,
    pointCount: 0,
    placeCount: 0,
    photoCount: 0,
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

describe("ExploreDiscovery — the route's pitch and grade (M19)", () => {
  it("shows the pitch on the card", () => {
    render(
      <ExploreDiscovery
        initial={page([item({ description: "Sheltered coast hop with a shingle put-in." })])}
        isAuthenticated
        ownedIds={[]}
      />,
    )
    expect(screen.getByText("Sheltered coast hop with a shingle put-in.")).toBeInTheDocument()
  })

  it("shows the grade by its label", () => {
    render(
      <ExploreDiscovery
        initial={page([item({ difficulty: DIFFICULTY.DEMANDING })])}
        isAuthenticated
        ownedIds={[]}
      />,
    )
    expect(screen.getByText(DIFFICULTY_LABELS[DIFFICULTY.DEMANDING])).toBeInTheDocument()
  })

  it("renders an ungraded, unpitched route without empty furniture", () => {
    const { container } = render(
      <ExploreDiscovery initial={page([item()])} isAuthenticated ownedIds={[]} />,
    )
    // No stray empty paragraph where the pitch would be — a blank line under every
    // card is worse than none, and most routes will have neither field set.
    expect(container.querySelector("[data-testid='route-pitch']")).toBeNull()
    for (const label of Object.values(DIFFICULTY_LABELS)) {
      expect(screen.queryByText(label)).not.toBeInTheDocument()
    }
  })

  it("clamps the pitch rather than hiding it on a narrow card", () => {
    render(
      <ExploreDiscovery
        initial={page([item({ description: "A very long pitch. ".repeat(40) })])}
        isAuthenticated
        ownedIds={[]}
      />,
    )
    const pitch = screen.getByTestId("route-pitch")
    // Clamped, never `hidden sm:block`: 320 is the browsing context where a
    // scannable pitch matters most (M19 decision 9). jsdom has no layout engine, so
    // this asserts the mechanism chosen, and 19-responsive.spec.ts measures the result.
    expect(pitch.className).toContain("line-clamp-2")
    expect(pitch.className).not.toContain("hidden")
  })
})

describe("ExploreDiscovery — search failure", () => {
  // searchPublicItineraries never rejects to its caller — it swallows fetch/parse
  // errors internally and resolves to an empty page (lib/itinerary/actions.ts). The
  // user-visible failure mode is therefore an empty-page response, not a thrown error.
  it("shows the empty state, not stale results, when a re-query resolves empty", async () => {
    mockSearch.mockResolvedValue(page([]))
    render(<ExploreDiscovery initial={page([item()])} isAuthenticated ownedIds={[]} />)

    await userEvent.click(screen.getByRole("button", { name: /filters/i }))
    await userEvent.click(screen.getByRole("button", { name: "winter" }))

    await waitFor(() =>
      expect(screen.getByText("No public routes match these filters.")).toBeInTheDocument(),
    )
    expect(screen.queryByText("Aegean loop")).not.toBeInTheDocument()
  })
})

describe("ExploreDiscovery — fork failure", () => {
  it("shows an error toast and stays on the page when forking fails", async () => {
    mockFork.mockResolvedValue({ success: false, error: "Could not fork this route." })
    render(
      <ExploreDiscovery initial={page([item()])} isAuthenticated ownedIds={["some-other-id"]} />,
    )

    await userEvent.click(screen.getByRole("button", { name: /use this route/i }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Could not fork this route."))
    expect(mockPush).not.toHaveBeenCalled()
    // Still on the explore page with the "Use this route" affordance intact.
    expect(screen.getByRole("button", { name: /use this route/i })).toBeInTheDocument()
  })

  it("redirects to login instead of forking when the viewer is unauthenticated", async () => {
    render(
      <ExploreDiscovery
        initial={page([item()])}
        isAuthenticated={false}
        ownedIds={["some-other-id"]}
      />,
    )

    await userEvent.click(screen.getByRole("button", { name: /use this route/i }))
    expect(mockPush).toHaveBeenCalledWith("/login")
    expect(mockFork).not.toHaveBeenCalled()
  })
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
    await userEvent.click(screen.getByRole("button", { name: /filters/i }))
    await userEvent.click(screen.getByRole("button", { name: "winter" }))
    await waitFor(() =>
      expect(mockSearch).toHaveBeenCalledWith(expect.objectContaining({ seasons: ["winter"] })),
    )
  })

  it("shows the active-filter count and clears everything via Clear filters", async () => {
    render(<ExploreDiscovery initial={page([item()])} isAuthenticated ownedIds={[]} />)
    await userEvent.click(screen.getByRole("button", { name: /filters/i }))
    await userEvent.click(screen.getByRole("button", { name: "winter" }))
    await waitFor(() =>
      expect(mockSearch).toHaveBeenCalledWith(expect.objectContaining({ seasons: ["winter"] })),
    )

    mockSearch.mockClear()
    await userEvent.click(screen.getByRole("button", { name: /clear filters/i }))
    await waitFor(() =>
      expect(mockSearch).toHaveBeenCalledWith(expect.objectContaining({ seasons: [] })),
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

// M23 §4. The library's emptiness has two causes and they need different copy — this is
// the anonymous root's first impression, and "widen the search" is nonsense advice when
// there is nothing in the library to widen towards.
describe("empty states", () => {
  it("invites a contribution when the library itself is empty", async () => {
    render(
      <ExploreDiscovery
        initial={{ items: [], total: 0, page: 1, pages: 1 }}
        isAuthenticated={false}
        ownedIds={[]}
      />,
    )
    expect(await screen.findByText(/no routes have been shared yet/i)).toBeInTheDocument()
    expect(screen.queryByText(/widen the search/i)).not.toBeInTheDocument()
  })

  it("advises widening the search once a filter is responsible for the miss", async () => {
    mockSearch.mockResolvedValue({ items: [], total: 0, page: 1, pages: 1 })
    render(
      <ExploreDiscovery
        initial={{ items: [item()], total: 1, page: 1, pages: 1 }}
        isAuthenticated={false}
        ownedIds={[]}
      />,
    )
    await userEvent.type(screen.getByLabelText(/search routes by name/i), "nothing-matches")

    expect(await screen.findByText(/no public routes match these filters/i)).toBeInTheDocument()
    expect(screen.queryByText(/no routes have been shared yet/i)).not.toBeInTheDocument()
  })
})
