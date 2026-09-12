import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { PublicRouteDetail } from "../public-route-detail"
import { DISTANCE_UNIT, formatDistance } from "@/lib/itinerary/distance"
import type { RouteData } from "@/lib/itinerary/public-routes"
import type { OriginalAuthor } from "@/lib/dtos/itinerary"
import { TRIP_STATE } from "@/lib/dtos/trip"
import { DIFFICULTY, DIFFICULTY_LABELS } from "@/lib/dtos/difficulty"

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
    boundaryColors: {},
    totalMiles: 42.5,
    dayCount: 3,
    ...overrides,
  }
}

describe("PublicRouteDetail — the route's pitch and grade (M19)", () => {
  function renderDetail(overrides: Partial<RouteData> = {}) {
    render(
      <PublicRouteDetail
        route={route(overrides)}
        season="summer"
        backHref="/explore"
        backLabel="All routes"
      />,
    )
  }

  it("renders the pitch in full — the sidebar is where it pays off", () => {
    const pitch =
      "Launches from a shingle beach with parking above the slipway. The headland " +
      "runs hard on the ebb, so cross north of it or wait for slack."
    renderDetail({ description: pitch })
    expect(screen.getByText(pitch)).toBeInTheDocument()
    // Clamped on the listing card, not here: this is the page you opened to read it.
    expect(screen.getByText(pitch).className).not.toContain("line-clamp")
  })

  it("renders the grade by its label", () => {
    renderDetail({ difficulty: DIFFICULTY.EXPERT })
    expect(screen.getByText(DIFFICULTY_LABELS[DIFFICULTY.EXPERT])).toBeInTheDocument()
  })

  it("renders neither when the route carries neither", () => {
    renderDetail()
    expect(screen.queryByTestId("route-pitch")).not.toBeInTheDocument()
    for (const label of Object.values(DIFFICULTY_LABELS)) {
      expect(screen.queryByText(label)).not.toBeInTheDocument()
    }
  })
})

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

  it("converts total distance to km when unit is km", () => {
    render(
      <PublicRouteDetail
        route={route()}
        season="summer"
        backHref="/explore"
        backLabel="All routes"
        unit={DISTANCE_UNIT.KM}
      />,
    )
    expect(screen.getByText(`${formatDistance(42.5, DISTANCE_UNIT.KM)} km`)).toBeInTheDocument()
    expect(screen.queryByText(/42\.5 nm/)).not.toBeInTheDocument()
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

  it("links to a linkable original author's public profile, by username", () => {
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
    const link = screen.getByRole("link", { name: "captain-jo" })
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
    expect(screen.queryByRole("link", { name: "captain-jo" })).not.toBeInTheDocument()
    expect(screen.getByText("captain-jo")).toBeInTheDocument()
  })

  it("renders the back link with the given href and label", () => {
    render(<PublicRouteDetail route={route()} season={null} backHref="/" backLabel="Home" />)
    const link = screen.getByRole("link", { name: "Home" })
    expect(link).toHaveAttribute("href", "/")
  })

  it("fills the slot it is given rather than positioning itself over the map", () => {
    render(
      <PublicRouteDetail
        route={route()}
        season={null}
        backHref="/explore"
        backLabel="All routes"
      />,
    )
    // PublicRouteShell owns where this sits and how wide it is — docked beside the
    // map from `md`, sliding over it below. A position of its own here would fight
    // that, and used to float the card over the route it frames (M12 §B/2.6).
    const panel = screen.getByTestId("route-detail-panel")
    expect(panel.className).not.toMatch(/absolute|fixed/)
    expect(panel.className).toMatch(/h-full/)
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
