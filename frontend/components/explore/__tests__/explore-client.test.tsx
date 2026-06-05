import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

const mockPush = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mockPush }) }))

vi.mock("next/dynamic", () => ({
  default: (_importFn: unknown, _opts?: unknown) =>
    function MockExploreMap({ selectedId }: { selectedId: string | null }) {
      return <div data-testid="explore-map" data-selected={selectedId ?? ""} />
    },
}))

const { mockForkItinerary } = vi.hoisted(() => ({
  mockForkItinerary: vi.fn(),
}))
vi.mock("@/lib/itinerary/actions", () => ({ forkItinerary: mockForkItinerary }))

import { ExploreClient } from "../explore-client"
import type { RouteData } from "@/lib/itinerary/public-routes"

const ROUTES: RouteData[] = [
  { id: "r1", name: "Cinque Terre", positions: [[44, 9]], totalMiles: 32, dayCount: 4 },
  { id: "r2", name: "Kornati Islands", positions: [[43, 15]], totalMiles: 48, dayCount: 6 },
]

beforeEach(() => vi.clearAllMocks())

describe("ExploreClient — card list", () => {
  it("renders a card for each route", () => {
    render(<ExploreClient routes={ROUTES} isAuthenticated={true} />)
    expect(screen.getByText("Cinque Terre")).toBeInTheDocument()
    expect(screen.getByText("Kornati Islands")).toBeInTheDocument()
  })

  it("shows distance and day count on each card", () => {
    render(<ExploreClient routes={ROUTES} isAuthenticated={true} />)
    expect(screen.getByText(/32.*nm/)).toBeInTheDocument()
    expect(screen.getByText(/4.*days/)).toBeInTheDocument()
  })

  it("renders a 'Use this route' button for each card", () => {
    render(<ExploreClient routes={ROUTES} isAuthenticated={true} />)
    expect(screen.getAllByRole("button", { name: /use this route/i })).toHaveLength(2)
  })
})

describe("ExploreClient — hover / map sync", () => {
  it("passes null selectedId to map initially", () => {
    render(<ExploreClient routes={ROUTES} isAuthenticated={true} />)
    expect(screen.getByTestId("explore-map")).toHaveAttribute("data-selected", "")
  })

  it("updates selectedId when a card is hovered", async () => {
    render(<ExploreClient routes={ROUTES} isAuthenticated={true} />)
    await userEvent.hover(screen.getByText("Cinque Terre"))
    expect(screen.getByTestId("explore-map")).toHaveAttribute("data-selected", "r1")
  })

  it("clears selectedId when the mouse leaves a card", async () => {
    render(<ExploreClient routes={ROUTES} isAuthenticated={true} />)
    await userEvent.hover(screen.getByText("Cinque Terre"))
    await userEvent.unhover(screen.getByText("Cinque Terre"))
    expect(screen.getByTestId("explore-map")).toHaveAttribute("data-selected", "")
  })
})

describe("ExploreClient — fork", () => {
  it("calls forkItinerary and navigates on success when authenticated", async () => {
    mockForkItinerary.mockResolvedValue({ success: true, itineraryId: "forked-id" })
    render(<ExploreClient routes={ROUTES} isAuthenticated={true} />)
    await userEvent.click(screen.getAllByRole("button", { name: /use this route/i })[0])
    expect(mockForkItinerary).toHaveBeenCalledWith("r1")
    expect(mockPush).toHaveBeenCalledWith("/itinerary/forked-id")
  })

  it("redirects to login when not authenticated", async () => {
    render(<ExploreClient routes={ROUTES} isAuthenticated={false} />)
    await userEvent.click(screen.getAllByRole("button", { name: /use this route/i })[0])
    expect(mockForkItinerary).not.toHaveBeenCalled()
    expect(mockPush).toHaveBeenCalledWith("/login")
  })
})
