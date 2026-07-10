import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { PublicRouteDetail } from "../public-route-detail"
import type { RouteData } from "@/lib/itinerary/public-routes"
import type { OriginalAuthor } from "@/lib/dtos/itinerary"
import { TRIP_STATE } from "@/lib/dtos/trip"

function route(overrides: Partial<RouteData> = {}): RouteData {
  return {
    id: "route-1",
    name: "Aegean loop",
    positions: [],
    days: [
      {
        dayNumber: 1,
        date: "2026-07-01",
        color: "#2272b6",
        points: [],
        distanceNm: 12.3,
      },
    ],
    totalMiles: 42.5,
    dayCount: 3,
    ...overrides,
  }
}

describe("PublicRouteDetail", () => {
  it("renders the route name, distance and day count", () => {
    render(
      <PublicRouteDetail
        route={route()}
        season="summer"
        backHref="/explore"
        backLabel="All routes"
      />,
    )
    expect(screen.getByText("Aegean loop")).toBeInTheDocument()
    expect(screen.getByText("42.5 nm")).toBeInTheDocument()
    expect(screen.getByText("3 days")).toBeInTheDocument()
  })

  it("renders the season badge when a season is given", () => {
    render(
      <PublicRouteDetail
        route={route()}
        season="summer"
        backHref="/explore"
        backLabel="All routes"
      />,
    )
    expect(screen.getByText("summer")).toBeInTheDocument()
  })

  it("renders the day breakdown derived from the route's own day segments", () => {
    render(
      <PublicRouteDetail
        route={route()}
        season={null}
        backHref="/explore"
        backLabel="All routes"
      />,
    )
    expect(screen.getByText("Day 1")).toBeInTheDocument()
  })

  it("links to a linkable original author's public profile", () => {
    const author: OriginalAuthor = { username: "captain-jo", name: "Jo", linkable: true }
    render(
      <PublicRouteDetail
        route={route()}
        season={null}
        author={author}
        backHref="/explore"
        backLabel="All routes"
      />,
    )
    const link = screen.getByRole("link", { name: "Jo" })
    expect(link).toHaveAttribute("href", "/paddlers/captain-jo")
  })

  it("does not link a non-linkable original author", () => {
    const author: OriginalAuthor = { username: "captain-jo", name: "Jo", linkable: false }
    render(
      <PublicRouteDetail
        route={route()}
        season={null}
        author={author}
        backHref="/explore"
        backLabel="All routes"
      />,
    )
    expect(screen.queryByRole("link", { name: "Jo" })).not.toBeInTheDocument()
    expect(screen.getByText("Jo")).toBeInTheDocument()
  })

  it("renders the back link with the given href and label", () => {
    render(<PublicRouteDetail route={route()} season={null} backHref="/" backLabel="Home" />)
    const link = screen.getByRole("link", { name: "Home" })
    expect(link).toHaveAttribute("href", "/")
  })

  it("docks as a side panel, not an overlay positioned over the map", () => {
    render(
      <PublicRouteDetail
        route={route()}
        season={null}
        backHref="/explore"
        backLabel="All routes"
      />,
    )
    const panel = screen.getByTestId("route-detail-panel")
    expect(panel.className).not.toMatch(/absolute/)
  })

  it("renders the actions slot", () => {
    render(
      <PublicRouteDetail
        route={route()}
        season={null}
        backHref="/explore"
        backLabel="All routes"
        actions={<button>Fork this route</button>}
      />,
    )
    expect(screen.getByRole("button", { name: "Fork this route" })).toBeInTheDocument()
  })

  it("marks a past trip as history via tripState, without a badge for building/happening", () => {
    const { rerender } = render(
      <PublicRouteDetail
        route={route()}
        season={null}
        tripState={TRIP_STATE.PAST}
        backHref="/explore"
        backLabel="All routes"
      />,
    )
    expect(screen.getByText("Past")).toBeInTheDocument()

    rerender(
      <PublicRouteDetail
        route={route()}
        season={null}
        tripState={TRIP_STATE.BUILDING}
        backHref="/explore"
        backLabel="All routes"
      />,
    )
    expect(screen.queryByText("Building")).not.toBeInTheDocument()
  })
})
