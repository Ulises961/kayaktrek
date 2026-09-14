import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { RouteSignals } from "../route-signals"
import { DISTANCE_UNIT, formatDistance } from "@/lib/itinerary/distance"
import type { ExploreItem } from "@/lib/dtos/itinerary"

function item(overrides: Partial<ExploreItem> = {}): ExploreItem {
  return {
    id: "r1",
    name: "Costa Brava",
    description: null,
    difficulty: null,
    totalMiles: 16,
    dayCount: 3,
    season: null,
    centroidLat: null,
    centroidLng: null,
    previewPositions: [],
    createdFromId: null,
    originalAuthor: null,
    author: null,
    longestDayMiles: null,
    pointCount: 0,
    placeCount: 0,
    photoCount: 0,
    ...overrides,
  }
}

describe("RouteSignals", () => {
  describe("longest day", () => {
    it("reports the hardest day, which is the point of the field", () => {
      render(<RouteSignals item={item({ longestDayMiles: 9.4 })} unit={DISTANCE_UNIT.NM} />)
      expect(
        screen.getByText(new RegExp(`Longest day ${formatDistance(9.4, DISTANCE_UNIT.NM)}`, "i")),
      ).toBeInTheDocument()
    })

    it("stays silent on a single-day route, where it would only repeat the total", () => {
      render(
        <RouteSignals item={item({ dayCount: 1, longestDayMiles: 16 })} unit={DISTANCE_UNIT.NM} />,
      )
      expect(screen.queryByText(/longest day/i)).not.toBeInTheDocument()
    })

    it("stays silent when the backend has no figure", () => {
      render(<RouteSignals item={item({ longestDayMiles: null })} unit={DISTANCE_UNIT.NM} />)
      expect(screen.queryByText(/longest day/i)).not.toBeInTheDocument()
    })
  })

  describe("counts", () => {
    it("lists only the counts that are non-zero", () => {
      render(
        <RouteSignals
          item={item({ pointCount: 12, placeCount: 0, photoCount: 6 })}
          unit={DISTANCE_UNIT.NM}
        />,
      )
      expect(screen.getByText("12 points · 6 photos")).toBeInTheDocument()
    })

    it("singularises, so a one-photo route does not read as '1 photos'", () => {
      render(
        <RouteSignals
          item={item({ pointCount: 1, placeCount: 1, photoCount: 1 })}
          unit={DISTANCE_UNIT.NM}
        />,
      )
      expect(screen.getByText("1 point · 1 place · 1 photo")).toBeInTheDocument()
    })

    // The live library's only route has no places and no photos. A bare route must not
    // render an empty separator line.
    it("renders no counts line at all for a route with no annotations", () => {
      const { container } = render(<RouteSignals item={item()} unit={DISTANCE_UNIT.NM} />)
      expect(container.textContent).not.toContain("·")
    })
  })

  describe("author", () => {
    it("links to a paddler whose profile is public, by username", () => {
      render(
        <RouteSignals
          item={item({ author: { username: "ada", name: "Ada", linkable: true } })}
          unit={DISTANCE_UNIT.NM}
        />,
      )
      expect(screen.getByRole("link", { name: "ada" })).toHaveAttribute("href", "/paddlers/ada")
    })

    it("names but does not link a paddler whose profile is private", () => {
      render(
        <RouteSignals
          item={item({ author: { username: "ada", name: "Ada", linkable: false } })}
          unit={DISTANCE_UNIT.NM}
        />,
      )
      expect(screen.getByText("ada")).toBeInTheDocument()
      expect(screen.queryByRole("link")).not.toBeInTheDocument()
    })

    it("uses the username even when a display name is set", () => {
      render(
        <RouteSignals
          item={item({ author: { username: "ada", name: "Ada Paddler", linkable: true } })}
          unit={DISTANCE_UNIT.NM}
        />,
      )
      expect(screen.getByRole("link", { name: "ada" })).toBeInTheDocument()
      expect(screen.queryByText("Ada Paddler")).not.toBeInTheDocument()
    })

    it("renders nothing when the route has no author", () => {
      render(<RouteSignals item={item()} unit={DISTANCE_UNIT.NM} />)
      expect(screen.queryByText(/^By/)).not.toBeInTheDocument()
    })
  })
})
